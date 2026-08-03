use reqwest::{
    header::{HeaderMap, LOCATION},
    redirect, StatusCode, Url,
};
use std::{
    collections::HashSet,
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr},
    time::Duration,
};

const MAX_REMOTE_REDIRECTS: usize = 5;
const REMOTE_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const REMOTE_READ_TIMEOUT: Duration = Duration::from_secs(30);
const REMOTE_DNS_TIMEOUT: Duration = Duration::from_secs(10);

pub(crate) fn parse_and_validate_remote_url(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|error| format!("Invalid remote URL: {error}"))?;
    validate_remote_url_syntax(&url)?;
    Ok(url)
}

fn validate_remote_url_syntax(url: &Url) -> Result<(), String> {
    if url.scheme() != "https" {
        return Err("Remote download sources must use HTTPS.".to_string());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Remote download URLs may not contain credentials.".to_string());
    }
    if url.fragment().is_some() {
        return Err("Remote download URLs may not contain fragments.".to_string());
    }
    let host = url
        .host_str()
        .ok_or_else(|| "Remote download URL is missing a host.".to_string())?;
    let normalized_host = host.trim_end_matches('.').to_ascii_lowercase();
    if normalized_host == "localhost" || normalized_host.ends_with(".localhost") {
        return Err("Remote download URL resolves to a local-only host.".to_string());
    }
    if let Some(ip) = parse_url_host_ip(host) {
        validate_public_ip(ip)?;
    }
    Ok(())
}

fn parse_url_host_ip(host: &str) -> Option<IpAddr> {
    host.strip_prefix('[')
        .and_then(|value| value.strip_suffix(']'))
        .unwrap_or(host)
        .parse()
        .ok()
}

fn validate_public_ip(ip: IpAddr) -> Result<(), String> {
    let is_public = match ip {
        IpAddr::V4(ip) => is_public_ipv4(ip),
        IpAddr::V6(ip) => is_public_ipv6(ip),
    };
    if is_public {
        Ok(())
    } else {
        Err(format!(
            "Remote download URL uses a private, local, or reserved IP address ({ip})."
        ))
    }
}

fn is_public_ipv4(ip: Ipv4Addr) -> bool {
    let [a, b, c, _] = ip.octets();
    !matches!(
        (a, b, c),
        (0, _, _)
            | (10, _, _)
            | (100, 64..=127, _)
            | (127, _, _)
            | (169, 254, _)
            | (172, 16..=31, _)
            | (192, 0, 0)
            | (192, 0, 2)
            | (192, 88, 99)
            | (192, 168, _)
            | (198, 18..=19, _)
            | (198, 51, 100)
            | (203, 0, 113)
            | (224..=255, _, _)
    )
}

fn is_public_ipv6(ip: Ipv6Addr) -> bool {
    if let Some(mapped) = ip.to_ipv4_mapped() {
        return is_public_ipv4(mapped);
    }
    let segments = ip.segments();
    if segments[0] & 0xe000 != 0x2000 {
        return false;
    }
    if segments[0] == 0x2001
        && (segments[1] == 0x0000
            || segments[1] == 0x0002
            || (0x0010..=0x002f).contains(&segments[1])
            || segments[1] == 0x0db8)
    {
        return false;
    }
    if segments[0] == 0x2002 {
        return false;
    }
    if segments[0] == 0x3fff && segments[1] & 0xf000 == 0 {
        return false;
    }
    true
}

async fn resolve_public_remote_addresses(url: &Url) -> Result<Vec<SocketAddr>, String> {
    validate_remote_url_syntax(url)?;
    let host = url
        .host_str()
        .ok_or_else(|| "Remote download URL is missing a host.".to_string())?;
    let port = url
        .port_or_known_default()
        .ok_or_else(|| "Remote download URL is missing a usable port.".to_string())?;

    let addresses = if let Some(ip) = parse_url_host_ip(host) {
        vec![SocketAddr::new(ip, port)]
    } else {
        let resolved =
            tokio::time::timeout(REMOTE_DNS_TIMEOUT, tokio::net::lookup_host((host, port)))
                .await
                .map_err(|_| format!("DNS resolution timed out for {host}."))?
                .map_err(|error| format!("Could not resolve remote host {host}: {error}"))?;
        let mut unique = HashSet::new();
        resolved
            .filter(|address| unique.insert(*address))
            .collect::<Vec<_>>()
    };
    validate_resolved_addresses(&addresses)?;
    Ok(addresses)
}

fn validate_resolved_addresses(addresses: &[SocketAddr]) -> Result<(), String> {
    if addresses.is_empty() {
        return Err("Remote host did not resolve to any address.".to_string());
    }
    for address in addresses {
        validate_public_ip(address.ip())?;
    }
    Ok(())
}

fn build_pinned_remote_client(
    url: &Url,
    addresses: &[SocketAddr],
    request_timeout: Duration,
) -> Result<reqwest::Client, String> {
    let host = url
        .host_str()
        .ok_or_else(|| "Remote download URL is missing a host.".to_string())?;
    let mut builder = reqwest::Client::builder()
        .redirect(redirect::Policy::none())
        .referer(false)
        .no_proxy()
        .https_only(true)
        .connect_timeout(REMOTE_CONNECT_TIMEOUT)
        .read_timeout(REMOTE_READ_TIMEOUT)
        .timeout(request_timeout);
    if parse_url_host_ip(host).is_none() {
        builder = builder.resolve_to_addrs(host, addresses);
    }
    builder
        .build()
        .map_err(|error| format!("Could not configure secure remote downloader: {error}"))
}

pub(crate) async fn send_validated_remote_request_with_headers(
    mut url: Url,
    headers: HeaderMap,
    request_timeout: Duration,
) -> Result<reqwest::Response, String> {
    let mut visited = HashSet::new();
    visited.insert(url.as_str().to_string());
    let mut redirects_followed = 0;

    loop {
        let addresses = resolve_public_remote_addresses(&url).await?;
        let client = build_pinned_remote_client(&url, &addresses, request_timeout)?;
        let response = client
            .get(url.clone())
            .headers(headers.clone())
            .send()
            .await
            .map_err(|error| format!("Remote download failed: {error}"))?;

        if is_followable_redirect_status(response.status()) {
            let location = response
                .headers()
                .get(LOCATION)
                .ok_or_else(|| {
                    "Remote download redirect did not include a Location header.".to_string()
                })?
                .to_str()
                .map_err(|_| "Remote download redirect Location was not valid text.".to_string())?;
            let next =
                validated_redirect_url(&url, location, redirects_followed, MAX_REMOTE_REDIRECTS)?;
            if !visited.insert(next.as_str().to_string()) {
                return Err("Remote download redirect loop was detected.".to_string());
            }
            redirects_followed += 1;
            url = next;
            continue;
        }
        if response.status().is_redirection() {
            return Err(format!(
                "Remote download returned unsupported redirect status {}.",
                response.status()
            ));
        }
        if !response.status().is_success() {
            return Err(format!("Remote download returned {}.", response.status()));
        }
        return Ok(response);
    }
}

fn is_followable_redirect_status(status: StatusCode) -> bool {
    matches!(
        status,
        StatusCode::MOVED_PERMANENTLY
            | StatusCode::FOUND
            | StatusCode::SEE_OTHER
            | StatusCode::TEMPORARY_REDIRECT
            | StatusCode::PERMANENT_REDIRECT
    )
}

fn validated_redirect_url(
    current: &Url,
    location: &str,
    redirects_followed: usize,
    max_redirects: usize,
) -> Result<Url, String> {
    if redirects_followed >= max_redirects {
        return Err(format!(
            "Remote download exceeded the {max_redirects}-redirect limit."
        ));
    }
    let next = current
        .join(location)
        .map_err(|error| format!("Invalid remote download redirect: {error}"))?;
    validate_remote_url_syntax(&next)?;
    Ok(next)
}
