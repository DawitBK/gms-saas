import { apiClient } from "@shared/lib/api-client";

export interface ScanResponse {
  success: boolean;
  data: {
    raw_text: string;
    extracted: {
      full_name?: string;
      id_number?: string;
      dob?: string;
    };
    watchlist: {
      alerted: boolean;
      reason?: string;
    };
    verification: {
      matched: boolean;
    };
  };
}

export const scanDocument = async (image: string, expectedName?: string): Promise<ScanResponse> => {
  const response = await apiClient.post("/ocr/scan", { image, expected_name: expectedName });
  return response.data;
};
