import { API_URL } from "@env";
import { fetchWithAuth } from "./token";

export const getRedirectedUrl = async (url: string) => {
  try {
    const apiRoute = `${API_URL}/recording/get_redirect`;
    //console.log("apiroute", apiRoute);
    const response = await fetchWithAuth(apiRoute, {
      method: "GET",
    });

    if (!response.ok) {
      console.error(
        "Failed to fetch URL:",
        response.status,
        response.statusText
      );
      return null;
    }

    const data = await response.json();
    if (data.url) {
      console.log("Redirected URL:", data.url);
      return data.url;
    } else {
      console.error("Error:", data.error);
      return null;
    }
  } catch (error) {
    console.error("Error fetching URL:", error);
    return null;
  }
};
