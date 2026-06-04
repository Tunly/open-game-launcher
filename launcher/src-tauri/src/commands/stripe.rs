use reqwest;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct CheckoutLineItem {
    pub price_id: String,
    pub quantity: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CheckoutSessionResponse {
    pub session_id: String,
    pub checkout_url: String,
}

/// Creates a Stripe Checkout Session via local Supabase Edge Function.
/// Accepts supabase URL + anon key directly (same pattern as sync commands).
#[tauri::command]
pub async fn create_stripe_checkout_session(
    supabase_url: String,
    supabase_anon_key: String,
    line_items: Vec<CheckoutLineItem>,
    user_id: String,
) -> Result<CheckoutSessionResponse, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "{}/functions/v1/stripe-create-checkout",
        supabase_url.trim_end_matches('/')
    );

    let body = serde_json::json!({
        "line_items": line_items.iter().map(|li| serde_json::json!({
            "price": li.price_id,
            "quantity": li.quantity,
        })).collect::<Vec<_>>(),
        "user_id": user_id,
        "success_url": format!("{}/store/checkout/success?session_id={{CHECKOUT_SESSION_ID}}", supabase_url),
        "cancel_url": format!("{}/store/checkout/cancel", supabase_url),
    });

    let resp = client
        .post(&url)
        .header("apikey", &supabase_anon_key)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Stripe checkout request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let txt = resp.text().await.unwrap_or_default();
        return Err(format!("Stripe checkout returned {status}: {txt}"));
    }

    let session: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Stripe checkout parse failed: {e}"))?;

    Ok(CheckoutSessionResponse {
        session_id: session["id"].as_str().unwrap_or("").to_string(),
        checkout_url: session["url"].as_str().unwrap_or("").to_string(),
    })
}
