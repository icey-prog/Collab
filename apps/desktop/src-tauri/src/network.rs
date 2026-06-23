//! Network helpers : IP LAN + détection hotspot Windows.
//!
//! B10 fix : `local_ip_address::local_ip()` peut retourner loopback ou IP de
//! NIC virtuelle (WSL, Docker, VirtualBox). On porte ici la logique scoring
//! du backend `getLanIp()` pour préférer Wi-Fi/Ethernet 192.168.x / 10.x.

use local_ip_address::list_afinet_netifas;
use std::net::IpAddr;

fn ip_score(ip: &str) -> i32 {
  if ip.starts_with("192.168.") { return 100; }
  if ip.starts_with("10.")       { return  90; }
  // 172.16.0.0/12 — privé
  if let Some(rest) = ip.strip_prefix("172.") {
    if let Some(second) = rest.split('.').next() {
      if let Ok(n) = second.parse::<u8>() {
        if (16..=31).contains(&n) { return 80; }
      }
    }
  }
  if ip.starts_with("169.254.") { return -10; } // APIPA link-local
  if ip.starts_with("127.")     { return -100; } // loopback
  0
}

fn nic_score(name: &str) -> i32 {
  let lower = name.to_lowercase();
  // Pénalise virtuels connus
  for k in ["docker", "veth", "br-", "vethernet", "virtualbox", "wsl", "tap", "tun", "utun", "hyper-v"] {
    if lower.contains(k) { return -50; }
  }
  // Privilégie Wi-Fi / Ethernet
  for k in ["wlan", "wifi", "wlp", "en0", "eth0", "enp", "eno", "wi-fi", "ethernet"] {
    if lower.contains(k) { return 10; }
  }
  0
}

#[tauri::command]
pub fn get_local_ip() -> Option<String> {
  // Tente d'abord la liste complète des interfaces avec scoring.
  if let Ok(ifaces) = list_afinet_netifas() {
    let mut candidates: Vec<(String, String, i32)> = ifaces
      .into_iter()
      .filter_map(|(name, ip)| match ip {
        IpAddr::V4(v4) if !v4.is_loopback() && !v4.is_link_local() => {
          let s = v4.to_string();
          let score = ip_score(&s) + nic_score(&name);
          Some((name, s, score))
        }
        _ => None,
      })
      .collect();
    candidates.sort_by_key(|(_, _, s)| -s);
    if let Some((_, ip, _)) = candidates.into_iter().next() {
      return Some(ip);
    }
  }
  // Fallback : local_ip() classique
  local_ip_address::local_ip().ok().map(|ip| ip.to_string())
}

/// Windows uniquement : retourne true si le mobile hotspot est démarré.
/// Sur Mac/Linux : toujours false (à étendre plus tard).
#[tauri::command]
pub fn check_hotspot_active() -> bool {
  #[cfg(target_os = "windows")]
  {
    use std::process::Command;
    let out = Command::new("netsh")
      .args(["wlan", "show", "hostednetwork"])
      .output();
    if let Ok(out) = out {
      let stdout = String::from_utf8_lossy(&out.stdout);
      return stdout.contains("Started") || stdout.contains("Démarré");
    }
  }
  false
}
