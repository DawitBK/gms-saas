"use client";

import { useState, useRef } from "react";
import { Upload, X, FileText, Loader2, CheckCircle2, AlertCircle, Download } from "lucide-react";
import { adminApi } from "@features/admin/api";
import { toast } from "sonner";
import { clsx } from "clsx";
import { PasswordConfirmModal } from "@shared/components/ui/PasswordConfirmModal";

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * BulkUploadModal
 * 
 * High-performance administrative tool for mass user provisioning.
 * Integrated with the enterprise design system using semantic tokens.
 */
export function BulkUploadModal({ isOpen, onClose, onSuccess }: BulkUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [results, setResults] = useState<{ success: boolean; email: string; error?: string }[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: 'download' | 'upload' } | null>(null);

  if (!isOpen) return null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      setFile(droppedFile);
      setResults(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResults(null);
    }
  };

  const handleUpload = () => {
    if (!file) return;
    setPendingAction({ type: 'upload' });
    setIsConfirmOpen(true);
  };

  const executeUpload = async () => {
    setIsUploading(true);
    try {
      if (!file) return;
      // Loaded on demand — this modal's import site (BulkUploadModal is
      // often imported at the top of a page for a rarely-opened "Bulk
      // Import" button) previously pulled the whole xlsx library into every
      // such page's initial bundle regardless of whether it was ever used.
      const XLSX = await import("xlsx");
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(worksheet);

      if (!json.length) {
        throw new Error("The file appears to be empty.");
      }

      // Smart mapping to handle headerless or inconsistently labeled files
      const mappedRows = json.map((row: any) => {
        const values = Object.values(row).map(v => String(v).trim());
        const email = row["Email Address"] || row.email || values.find(v => v.includes('@'));
        const fullName = row["Full Name"] || row.full_name || row.name || values.find(v => v.split(' ').length >= 2 && !v.includes('@')) || email?.split('@')[0];
        
        return {
          full_name: fullName,
          email: email,
          roles: row["Roles (comma separated)"] || row.roles || 'host',
          office_name: row["Office Name"] || row.office_name,
          department_name: row["Department Name"] || row.department_name,
          services: row["Services (comma separated)"] || row.services,
          company: row["Company (Guests Only)"] || row.company,
          government_id: row["ID Number (Guests Only)"] || row.government_id,
        };
      });

      if (!mappedRows[0].email) {
        throw new Error("Invalid file format. 'Email Address' column is required.");
      }

      const importResults = await adminApi.bulkImport(mappedRows);
      setResults(importResults);
      
      const successCount = importResults.filter((r: any) => r.success).length;
      if (successCount > 0) {
        toast.success(`Successfully imported ${successCount} users.`);
        onSuccess?.();
      } else {
        toast.error("Bulk import failed for all rows.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to process bulk upload.");
    } finally {
      setIsUploading(false);
    }
  };

  const downloadTemplate = () => {
    setPendingAction({ type: 'download' });
    setIsConfirmOpen(true);
  };

  const executeDownload = async () => {
    const XLSX = await import("xlsx");
    const templateData = Array.from({ length: 50 }, (_, i) => {
      const idx = i + 1;
      const fNames = ["Abebe", "Sara", "Daniel", "Helen", "Kebede", "Marta", "Samuel", "Elias", "Tigist", "Yonas"];
      const lNames = ["Solomon", "Kassa", "Bayer", "Tekle", "Girma", "Haile", "Bekele", "Tadesse", "Zewde", "Mulugeta"];
      const roles = ["host", "reception", "guest", "admin", "super_host", "super_reception"];
      
      const role = idx % 7 === 0 ? "host,reception" : idx % 13 === 0 ? "admin,host" : roles[i % roles.length];
      const name = `${fNames[i % 10]} ${lNames[(i + 3) % 10]}`;
      
      return {
        "Full Name": name,
        "Email Address": `${name.replace(" ", ".").toLowerCase()}.${idx}@gms.local`,
        "Roles (comma separated)": role,
        "Office Name": "Example City HQ",
        "Department Name": role.includes("host") ? "Export Logistics" : "",
        "Services (comma separated)": role.includes("host") ? "Logistics Planning, Green Coffee Inspection" : "",
        "Company (Guests Only)": role.includes("guest") ? "Example Corp Partners" : "",
        "ID Number (Guests Only)": role.includes("guest") ? `ID-${1000 + idx}` : ""
      };
    });

    const instructions = [
      { "Section": "ROLE LIST", "Details": "guest, host, reception, admin, super_host, super_reception, super_admin" },
      { "Section": "MULTI-ROLE", "Details": "You can combine roles using commas (e.g., 'host,reception')" },
      { "Section": "OFFICE NAME", "Details": "Mandatory. Must match an existing office name (e.g., 'Example City HQ')" },
      { "Section": "DEPT NAME", "Details": "Mandatory for 'host' roles. Must match a department name." },
      { "Section": "SERVICES", "Details": "Optional. Comma-separated list of services to assign to the host." },
      { "Section": "PASSWORD", "Details": "Not set by import. Imported accounts get an unusable random password — the person signs in via SSO, or uses 'Forgot password' to set one from their email." },
    ];

    const wb = XLSX.utils.book_new();
    const wsData = XLSX.utils.json_to_sheet(templateData);
    wsData["!cols"] = [
      { wch: 25 }, { wch: 30 }, { wch: 20 }, { wch: 25 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(wb, wsData, "User Data");
    const wsInfo = XLSX.utils.json_to_sheet(instructions);
    wsInfo["!cols"] = [{ wch: 15 }, { wch: 80 }];
    XLSX.utils.book_append_sheet(wb, wsInfo, "GUIDELINES");
    
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "GMS_Enterprise_Bulk_Provisioning.xlsx";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PasswordConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={async () => {
          try {
            setIsConfirmOpen(false);
            if (pendingAction?.type === 'download') await executeDownload();
            if (pendingAction?.type === 'upload') await executeUpload();
          } catch (err) {
            console.error("[GMS] Action execution failed:", err);
          }
        }}
        title={pendingAction?.type === 'upload' ? "Confirm Bulk Import" : "Confirm Template Export"}
        description={
          pendingAction?.type === 'upload' 
            ? "You are about to perform a bulk user import. This will create multiple staff accounts in the system."
            : "You are about to export a user provisioning template. Please confirm your identity."
        }
        actionLabel={pendingAction?.type === 'upload' ? "Start Import" : "Export Data"}
      />
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-surface-background/80 backdrop-blur-enterprise animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl rounded-3xl-enterprise border border-surface-border bg-surface-card p-8 shadow-2xl shadow-black/40">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-6 top-6 rounded-full p-2 text-content-dimmed hover:bg-surface-overlay hover:text-content-base transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-start gap-4 mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl-enterprise bg-brand-primary/10 text-brand-accent">
            <Upload className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-content-base">Bulk User Provisioning</h2>
            <p className="mt-1 text-content-muted text-sm">
              Upload an Excel or CSV file to provision multiple Hosts, Receptionists, Admins, or Guests at once.
            </p>
          </div>
        </div>

        {!results ? (
          <div className="space-y-6">
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={clsx(
                "group relative flex cursor-pointer flex-col items-center justify-center rounded-3xl-enterprise border-2 border-dashed p-12 transition-all",
                isDragging 
                  ? "border-brand-primary bg-brand-primary/10 scale-[0.98]"
                  : file 
                    ? "border-brand-primary/50 bg-brand-primary/5" 
                    : "border-surface-border bg-surface-background/40 hover:border-brand-primary/30 hover:bg-surface-background/60"
              )}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".xlsx,.xls,.csv"
                className="hidden"
              />
              
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl-enterprise bg-surface-card text-content-dimmed group-hover:text-brand-accent transition-colors">
                {file ? <FileText className="h-8 w-8 text-brand-accent" /> : <Upload className="h-8 w-8" />}
              </div>
              
              <div className="mt-4 text-center">
                <p className="font-semibold text-content-base">
                  {file ? file.name : "Click to select or drag and drop"}
                </p>
                <p className="mt-1 text-xs text-content-dimmed">
                  Supported formats: .xlsx, .xls, .csv
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-2xl-enterprise bg-surface-background/60 px-6 py-4">
              <div className="flex items-center gap-3 text-sm text-content-muted">
                <Download className="h-4 w-4 text-content-dimmed" />
                <span>Need a template with all roles?</span>
              </div>
              <button
                type="button"
                onClick={downloadTemplate}
                className="text-xs font-bold uppercase tracking-widest text-brand-accent hover:text-brand-primary transition-colors"
              >
                Download Template
              </button>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="ui-btn ui-btn-secondary flex-1 py-3.5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpload}
                disabled={!file || isUploading}
                className="flex-1 rounded-2xl-enterprise bg-brand-primary py-4 font-bold text-white shadow-lg shadow-brand-primary/20 hover:bg-brand-primary/80 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {isUploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Upload className="h-5 w-5" />
                )}
                Start Import
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="max-h-[350px] overflow-y-auto pr-2 ui-scrollbar space-y-3">
              {results.map((r, idx) => (
                <div 
                  key={idx} 
                  className={clsx(
                    "flex items-center justify-between gap-4 rounded-2xl-enterprise border p-4 text-sm",
                    r.success 
                      ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-100" 
                      : "border-rose-500/20 bg-rose-500/5 text-rose-100"
                  )}
                >
                  <div className="flex items-center gap-3 truncate">
                    {r.success ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-rose-400" />
                    )}
                    <span className="truncate font-medium">{r.email}</span>
                  </div>
                  {!r.success && (
                    <span className="text-[10px] uppercase tracking-widest text-rose-400 font-bold whitespace-nowrap">
                      {r.error || "Failed"}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-2xl-enterprise border border-surface-border bg-surface-background py-4 font-semibold text-content-base hover:bg-surface-overlay transition-colors w-full"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  </>
  );
}
