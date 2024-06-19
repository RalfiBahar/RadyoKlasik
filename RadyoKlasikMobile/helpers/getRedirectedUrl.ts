import { API_URL } from "@env";

export const getRedirectedUrl = async (url: string) => {
  try {
    const response = await fetch(`${API_URL}/recording/get_redirect`, {
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
