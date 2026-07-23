const { GoogleAuth } = require('google-auth-library');

/**
 * Serverless / Proxy Function untuk Vertex AI Generative Model (Gemini 3.5 Flash)
 * Menggunakan kredensial dari env var GCP_SERVICE_ACCOUNT.
 */
async function vertexAIProxyHandler(req, res) {
  try {
    const rawEnvServiceAccount = process.env.GCP_SERVICE_ACCOUNT;
    if (!rawEnvServiceAccount) {
      return res.status(500).json({
        error: { message: 'Environment variable GCP_SERVICE_ACCOUNT tidak ditemukan.' }
      });
    }

    // 1. Parse JSON credentials dari env var
    let credentials;
    try {
      credentials = JSON.parse(rawEnvServiceAccount);
    } catch (parseErr) {
      return res.status(500).json({
        error: { message: 'Gagal memparsing JSON dari GCP_SERVICE_ACCOUNT: ' + parseErr.message }
      });
    }

    // 2. Buat GoogleAuth client & dapatkan access token
    const auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });

    const client = await auth.getClient();
    const accessTokenResponse = await client.getAccessToken();
    const accessToken = accessTokenResponse.token;

    if (!accessToken) {
      throw new Error('Gagal mendapatkan Access Token OAuth2 dari Service Account.');
    }

    // 3. Konfigurasi endpoint & model
    const projectId = credentials.project_id;
    const location = 'global';
    const model = 'gemini-3.5-flash';

    const host = location === 'global'
      ? 'aiplatform.googleapis.com'
      : `${location}-aiplatform.googleapis.com`;

    const url = `https://${host}/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`;

    // 4. Teruskan request ke REST Endpoint Vertex AI
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });

    const responseData = await response.json();
    return res.status(response.status).json(responseData);

  } catch (err) {
    console.error('Vertex AI Proxy Error:', err);
    return res.status(500).json({
      error: { message: 'Internal Server Proxy Error: ' + err.message }
    });
  }
}

module.exports = vertexAIProxyHandler;
