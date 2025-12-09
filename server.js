import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";
 
dotenv.config();
const app = express();
 
app.use(cors());
app.use(express.json());
 
// Zoho Config (from constants.ts - move to .env in prod)
const ZOHO_CONFIG = {
  CLIENT_ID: '1000.XHTNXZEJGBL5V9MAWT2IMH6I20WV2W',
  CLIENT_SECRET: '54610260c16d41e7e9b2ac1cfe7b00818d74dbc00a',
  REFRESH_TOKEN: '1000.c994c4051e0c2d9653378391e77de1ca.8d297cabeced02fbc97638fe690dec9c',
  AUTH_URL: 'https://accounts.zoho.in/oauth/v2/token',
  ATTENDANCE_API: 'https://people.zoho.in/people/api/attendance'
};
export const ESSL_CONFIG = {
  BASE_URL: 'http://ebioservernew.esslsecurity.com:99/WebService.asmx',
  USERNAME: 'essl',
  PASSWORD: 'essl',
  DEFAULT_LOCATION: 'mumbai hsi'
};
// Token cache
let accessToken = null;
let tokenExpiry = 0;
 
// Refresh token helper
const getZohoAccessToken = async () => {
  if (accessToken && Date.now() < tokenExpiry) {
    return accessToken;
  }
 
  try {
    const params = new URLSearchParams();
    params.append("refresh_token", ZOHO_CONFIG.REFRESH_TOKEN);
    params.append("client_id", ZOHO_CONFIG.CLIENT_ID);
    params.append("client_secret", ZOHO_CONFIG.CLIENT_SECRET);
    params.append("grant_type", "refresh_token");
 
    const resp = await axios.post(ZOHO_CONFIG.AUTH_URL, params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
 
    if (!resp.data.access_token) {
      throw new Error("No access token received");
    }
 
    accessToken = resp.data.access_token;
    tokenExpiry = Date.now() + (resp.data.expires_in * 1000) - (10 * 60 * 1000); // Refresh 10 min early
    return accessToken;
  } catch (err) {
    console.error("Zoho token refresh error:", err.response?.data || err.message);
    throw err;
  }
};
 
// Date formatter helper
const formatZohoDateTime = (dateTimeStr) => {
  if (!dateTimeStr) return "";
  const [date, time] = dateTimeStr.split(' ');
  if (!date || !time) return "";
  const [year, month, day] = date.split('-');
  if (year && month && day) {
    return `${day}/${month}/${year} ${time}`;
  }
  return dateTimeStr; // Fallback
};
 
app.post("/api/zoho/attendance", async (req, res) => {
  try {
    const { empId, checkIn, checkOut } = req.body;
 
    if (!empId) {
      return res.status(400).json({ error: true, message: "Missing empId (use Zoho employee ID)" });
    }
 
    // Get fresh token
    const token = await getZohoAccessToken();
 
    // Format dates
    const formattedCheckIn = formatZohoDateTime(checkIn);
    const formattedCheckOut = formatZohoDateTime(checkOut);
 
    const params = new URLSearchParams();
    params.append("dateFormat", "dd/MM/yyyy HH:mm:ss");
    params.append("checkIn", formattedCheckIn);
    params.append("checkOut", formattedCheckOut);
    params.append("empId", empId);
 
    const response = await axios.post(ZOHO_CONFIG.ATTENDANCE_API, params, {
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });
 
    console.log("Zoho Success:", response.data);
    res.json({ success: true, data: response.data });
  } catch (err) {
    const errorMsg = err.response?.data || err.message;
    console.error("ZP ERROR:", errorMsg);
    res.status(500).json({
      error: true,
      message: errorMsg,
      details: err.response?.status ? `HTTP ${err.response.status}` : "Network error"
    });
  }
});
 
app.post("/api/essl", async (req, res) => {
  try {
    const { soapAction, soapBody } = req.body;
 
    // eSSL SOAP services require quoted SOAPAction
    const actionHeader = `"${soapAction}"`;
 
    console.log("SOAPAction:", actionHeader);
    console.log("SOAP Body:", soapBody);
 
    const response = await axios.post(
      "http://ebioservernew.esslsecurity.com:99/WebService.asmx",
      soapBody,               // IMPORTANT: send RAW body, NOT SOAP envelope
      {
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: actionHeader
        },
        timeout: 15000
      }
    );
 
    console.log("ESSL Response:", response.data);
    res.send(response.data);
 
  } catch (err) {
    console.error("ESSL ERROR:", err.response?.data || err.message);
    res.status(500).send(err.response?.data || err.message);
  }
});
 
app.listen(5000, () => {
  console.log("Backend running on port 5000");
});