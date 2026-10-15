import { Suspense } from "react";
import AdminServicesPage from "./AdminServicesPage";

export default function Page() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-slate-950 text-white">Loading Catalog...</div>}>
      <AdminServicesPage />
    </Suspense>
  );
}
