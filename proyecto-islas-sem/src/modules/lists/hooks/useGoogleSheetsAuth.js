import { useState } from "react";

export function useGoogleSheetsAuth() {
  const [token, setToken] = useState(null);

  const requestAccess = () => {
    // Asegura que GIS está cargado antes de usarlo
    if (!window.google || !google.accounts || !google.accounts.oauth2) {
      console.error("Google Identity Services aún no está cargado.");
      return;
    }

    const client = google.accounts.oauth2.initTokenClient({
      client_id: "729876563582-tvi5c611bb1rklfabmthcp27kneov37e.apps.googleusercontent.com",
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      callback: (response) => {
        setToken(response.access_token);
      },
    });

    client.requestAccessToken();
  };

  const readSheet = async (spreadsheetId, range) => {
    if (!token) return [];

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      range
    )}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();
    if (!data.values) return [];

    return data.values
      .flat()
      .map((v) => v.toString().trim())
      .filter(Boolean);
  };

  return { requestAccess, readSheet, token };
}
