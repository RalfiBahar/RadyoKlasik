import AsyncStorage from "@react-native-async-storage/async-storage";
import { EXPO_PUBLIC_API_URL, EXPO_PUBLIC_SHARED_SECRET } from "@env";

let token: string | null = null;

interface TokenResponse {
  access_token?: string;
  error?: string;
}

export async function getToken(): Promise<string | null> {
  console.log(`${EXPO_PUBLIC_API_URL}/auth/generate_token`);
  const response = await fetch(`${EXPO_PUBLIC_API_URL}/auth/generate_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      shared_secret: EXPO_PUBLIC_SHARED_SECRET,
    }),
  });
  const data: TokenResponse = await response.json();
  if (data.access_token) {
    return data.access_token;
  } else {
    console.error("Failed to retrieve token");
    return null;
  }
}

export async function fetchWithAuth(
  url: string,
  options: RequestInit = {},
  retries: number = 10,
  delay: number = 1000
): Promise<Response> {
  options.headers = {
    ...options.headers,
    Authorization: `Bearer ${token}`,
  };
  let response = await fetch(url, options);
  if (response.status === 401) {
    const data: TokenResponse = await response.json();
    if (data.error === "token_expired") {
      console.log("Token expired, refreshing...");
      token = await getToken();
      if (token) {
        await AsyncStorage.setItem("token", token);
        options.headers = {
          ...options.headers,
          Authorization: `Bearer ${token}`,
        };
        response = await fetch(url, options); // Retry the request with new token
      } else {
        console.log("Failed to refresh token");
      }
    } else {
      console.log("Unauthorized");
    }
  }

  if (!response.ok && retries > 0 && response.status != 401) {
    console.log(`Retrying request... ${retries} attempts left`);
    await new Promise((res) => setTimeout(res, delay));
    return fetchWithAuth(url, options, retries - 1, delay * 2);
  }

  return response;
}

export async function initializeToken(): Promise<void> {
  token = await AsyncStorage.getItem("token");
  console.log("token", token);

  if (!token) {
    token = await getToken();

    if (token) {
      await AsyncStorage.setItem("token", token);
    } else {
      console.log("Couldn't fetch token");
      return;
    }
  }
}
