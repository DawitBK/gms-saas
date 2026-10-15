import { useMutation } from "@tanstack/react-query";
import { scanDocument, ScanResponse } from "./api";

export const useScanDocument = () => {
  return useMutation({
    mutationFn: (payload: { image: string; expectedName?: string }) => 
      scanDocument(payload.image, payload.expectedName),
  });
};
