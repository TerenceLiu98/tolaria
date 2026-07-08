use std::path::Path;
use std::process::Command;

pub(super) const NATIVE_PROVIDER: &str = "native";
pub(super) const WSL_PROVIDER: &str = "wsl";
const GIT_PROVIDER_ENV: &str = "SAPIENTIA_GIT_PROVIDER";
const GIT_WSL_DISTRO_ENV: &str = "SAPIENTIA_GIT_WSL_DISTRO";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum GitProviderSelection {
    Native,
    Wsl { distro: Option<String> },
}

impl GitProviderSelection {
    fn from_environment() -> Self {
        let provider = std::env::var(GIT_PROVIDER_ENV)
            .ok()
            .map(|value| value.trim().to_ascii_lowercase());

        if provider.as_deref() == Some(NATIVE_PROVIDER) {
            return Self::Native;
        }

        if provider.as_deref() == Some(WSL_PROVIDER) {
            return Self::Wsl {
                distro: std::env::var(GIT_WSL_DISTRO_ENV)
                    .ok()
                    .map(|value| value.trim().to_string())
                    .filter(|value| !value.is_empty()),
            };
        }

        Self::Native
    }
}

pub(super) fn selected_git_command_at(dir: &Path) -> Result<Command, String> {
    match GitProviderSelection::from_environment() {
        GitProviderSelection::Native => {
            let mut command = super::git_command();
            command.current_dir(dir);
            Ok(command)
        }
        GitProviderSelection::Wsl { distro } => wsl_git_command_at(dir, distro.as_deref()),
    }
}

fn wsl_git_command_at(dir: &Path, distro: Option<&str>) -> Result<Command, String> {
    if !wsl_supported_on_this_platform() {
        return Err("WSL Git is only available on Windows.".to_string());
    }

    let path = selected_git_path_argument(
        &dir.to_string_lossy(),
        &GitProviderSelection::Wsl {
            distro: distro.map(ToOwned::to_owned),
        },
    )?;
    let mut command = crate::hidden_command("wsl.exe");
    if let Some(distro) = distro.map(str::trim).filter(|value| !value.is_empty()) {
        command.args(["--distribution", distro]);
    }
    command.args(["--cd", &path, "--exec", "git"]);
    Ok(command)
}

pub(super) fn selected_git_path_argument(
    path: &str,
    provider: &GitProviderSelection,
) -> Result<String, String> {
    match provider {
        GitProviderSelection::Native => Ok(path.to_string()),
        GitProviderSelection::Wsl { .. } => windows_path_to_wsl_path(path).ok_or_else(|| {
            format!("The selected WSL Git provider cannot translate '{path}' to a WSL path.")
        }),
    }
}

#[cfg(target_os = "windows")]
fn wsl_supported_on_this_platform() -> bool {
    true
}

#[cfg(not(target_os = "windows"))]
fn wsl_supported_on_this_platform() -> bool {
    false
}

fn windows_path_to_wsl_path(path: &str) -> Option<String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.starts_with('/') {
        return Some(trimmed.to_string());
    }

    let normalized = trimmed.replace('\\', "/");
    drive_path_to_wsl_path(&normalized).or_else(|| wsl_unc_path_to_linux_path(&normalized))
}

fn drive_path_to_wsl_path(path: &str) -> Option<String> {
    let bytes = path.as_bytes();
    if bytes.len() < 3 || bytes[1] != b':' || bytes[2] != b'/' {
        return None;
    }

    let drive = bytes[0] as char;
    if !drive.is_ascii_alphabetic() {
        return None;
    }

    Some(format!(
        "/mnt/{}/{}",
        drive.to_ascii_lowercase(),
        &path[3..]
    ))
}

fn wsl_unc_path_to_linux_path(path: &str) -> Option<String> {
    for prefix in ["//wsl$/", "//wsl.localhost/"] {
        if let Some(rest) = path.strip_prefix(prefix) {
            let (_, linux_path) = rest.split_once('/')?;
            return Some(format!("/{linux_path}"));
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn translates_windows_drive_paths_for_wsl() {
        assert_eq!(
            windows_path_to_wsl_path(r"C:\Users\Terence\Vault").as_deref(),
            Some("/mnt/c/Users/Terence/Vault")
        );
        assert_eq!(
            windows_path_to_wsl_path("D:/Work/Sapientia").as_deref(),
            Some("/mnt/d/Work/Sapientia")
        );
    }

    #[test]
    fn translates_wsl_unc_paths_for_wsl() {
        assert_eq!(
            windows_path_to_wsl_path(r"\\wsl$\Ubuntu\home\terence\vault").as_deref(),
            Some("/home/terence/vault")
        );
        assert_eq!(
            windows_path_to_wsl_path(r"\\wsl.localhost\Debian\var\repo").as_deref(),
            Some("/var/repo")
        );
    }

    #[test]
    fn rejects_untranslatable_relative_paths() {
        assert_eq!(windows_path_to_wsl_path("notes/vault"), None);
        assert_eq!(windows_path_to_wsl_path(""), None);
    }

    #[test]
    fn native_provider_keeps_paths_unchanged() {
        assert_eq!(
            selected_git_path_argument("/Users/terence/vault", &GitProviderSelection::Native)
                .unwrap(),
            "/Users/terence/vault"
        );
    }
}
