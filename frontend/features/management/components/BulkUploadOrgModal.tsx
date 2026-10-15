"use client";

import { useAuthStore } from "@state/auth.store";
import { apiClient } from "@shared/lib/api-client";
import { useState, useRef } from "react";
import {
  Upload,
  X,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
  Building2,
  Workflow,
  CalendarPlus,
} from "lucide-react";
import * as XLSX from "xlsx";
import { adminApi } from "@features/admin/api";
import { toast } from "sonner";
import { clsx } from "clsx";
import { PasswordConfirmModal } from "@shared/components/ui/PasswordConfirmModal";

interface BulkUploadOrgModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function BulkUploadOrgModal({
  isOpen,
  onClose,
  onSuccess,
}: BulkUploadOrgModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [results, setResults] = useState<{
    offices: { success: boolean; name: string; error?: string }[];
    departments: { success: boolean; name: string; error?: string }[];
    services: { success: boolean; name: string; error?: string }[];
    hosts: { success: boolean; name: string; error?: string }[];
  } | null>(null);
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

      if (!/\.(xlsx|xls)$/i.test(file.name)) {
        throw new Error(
          "Upload the multi-sheet Excel template (.xlsx or .xls). CSV is not supported for organization imports.",
        );
      }

      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);

      const payload: any = {
        offices: [],
        departments: [],
        services: [],
        hosts: [],
      };
      const sheetMapping: Record<string, string> = {
        Offices: "offices",
        Office: "offices",
        offices: "offices",
        office: "offices",
        Departments: "departments",
        Department: "departments",
        departments: "departments",
        department: "departments",
        Services: "services",
        Service: "services",
        services: "services",
        service: "services",
        Hosts: "hosts",
        Host: "hosts",
        hosts: "hosts",
        host: "hosts",
      };

      Object.entries(workbook.Sheets).forEach(([sheetName, sheet]) => {
        const key = sheetMapping[sheetName.trim()];
        if (key) {
          payload[key] = [...payload[key], ...XLSX.utils.sheet_to_json(sheet)];
        }
      });

      if (
        !payload.offices.length &&
        !payload.departments.length &&
        !payload.services.length &&
        !payload.hosts.length
      ) {
        throw new Error(
          "No data found in valid sheets (Offices, Departments, Services, or Hosts).",
        );
      }

      const result = await adminApi.bulkImportOrg(payload);

      setResults(result);
      const totalSuccess =
        (result.offices?.filter((r: any) => r.success).length || 0) +
        (result.departments?.filter((r: any) => r.success).length || 0) +
        (result.services?.filter((r: any) => r.success).length || 0) +
        (result.hosts?.filter((r: any) => r.success).length || 0);

      if (totalSuccess > 0) {
        toast.success(`Successfully imported ${totalSuccess} items.`);
        onSuccess?.();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to process bulk upload.");
    } finally {
      setIsUploading(false);
    }
  };

  const downloadTemplate = () => {
    setPendingAction({ type: 'download' });
    setIsConfirmOpen(true);
  };

  const executeDownload = async () => {
    const downloadToastId = toast.loading("Preparing template download...");
    try {
      const data = await adminApi.downloadOrgTemplate();

      const blob = new Blob([data], { 
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" 
      });
      
      if (blob.size === 0) {
        throw new Error("Received an empty file from the server.");
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = "GMS_Organizational_Setup_Template_v2.xlsx";
      document.body.appendChild(a);
      a.click();
      
      // Cleanup
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 100);

      toast.success("Template downloaded successfully.", { id: downloadToastId });
    } catch (err: any) {
      console.error("Template download error:", err);
      
      // Handle cases where error response is also a blob
      let message = "Unknown error";
      if (err.response?.data instanceof Blob) {
        const text = await err.response.data.text();
        try {
          const json = JSON.parse(text);
          message = json.message || json.error?.message || "Server error";
        } catch {
          message = "Server error (failed to generate template)";
        }
      } else {
        message = err.response?.data?.message || err.message || "Unknown error";
      }
      
      toast.error(`Download failed: ${message}`, { id: downloadToastId });
    }
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
        title={pendingAction?.type === 'upload' ? "Confirm System Seeding" : "Confirm Template Export"}
        description={
          pendingAction?.type === 'upload' 
            ? "You are about to perform a bulk system seeding. This will create multiple offices, departments, and services. This action cannot be easily undone."
            : "You are about to export a template containing your organization's sensitive structural data. Please confirm your identity."
        }
        actionLabel={pendingAction?.type === 'upload' ? "Initialize System" : "Export Data"}
      />
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl rounded-[2.5rem] border border-slate-800 bg-slate-900 p-8 shadow-2xl shadow-cyan-500/10">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-6 top-6 rounded-full p-2 text-slate-500 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-start gap-4 mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Structure Seeding</h2>
            <p className="mt-1 text-slate-400 text-sm">
              Bulk provision Offices, Departments, and Services to build your
              organization hierarchy in seconds.
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
                "group relative flex cursor-pointer flex-col items-center justify-center rounded-[2rem] border-2 border-dashed p-12 transition-all",
                isDragging
                  ? "border-cyan-400 bg-cyan-500/10 scale-[0.98]"
                  : file
                    ? "border-cyan-500/50 bg-cyan-500/5"
                    : "border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-950/60",
              )}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".xlsx,.xls"
                className="hidden"
              />

              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-slate-400 group-hover:text-cyan-400 transition-colors">
                {file ? (
                  <FileText className="h-8 w-8 text-cyan-400" />
                ) : (
                  <Upload className="h-8 w-8" />
                )}
              </div>

              <div className="mt-4 text-center">
                <p className="font-semibold text-white">
                  {file ? file.name : "Drop organization manifest here"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Excel workbook only. Must contain sheets: Offices,
                  Departments, Services, Hosts
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-2xl bg-slate-950/60 px-6 py-4">
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <Download className="h-4 w-4 text-slate-500" />
                <span>Need the structural template?</span>
              </div>
              <button
                type="button"
                onClick={downloadTemplate}
                className="text-xs font-bold uppercase tracking-widest text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                Download Template
              </button>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-2xl border border-slate-800 bg-slate-950 py-3.5 font-semibold text-slate-300 hover:bg-slate-900 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpload}
                disabled={!file || isUploading}
                className="flex-1 rounded-2xl bg-cyan-500 py-3.5 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 hover:bg-cyan-400 disabled:opacity-50 disabled:hover:bg-cyan-500 transition-all flex items-center justify-center gap-2"
              >
                {isUploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Upload className="h-5 w-5" />
                )}
                Initialize Organization
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-4 gap-4">
              <ResultCard
                title="Offices"
                items={results.offices}
                icon={Building2}
              />
              <ResultCard
                title="Departments"
                items={results.departments}
                icon={Workflow}
              />
              <ResultCard
                title="Services"
                items={results.services}
                icon={CalendarPlus}
              />
              <ResultCard title="Hosts" items={results.hosts} icon={Workflow} />
            </div>

            <div className="pt-4">
              <button
                onClick={onClose}
                className="w-full rounded-2xl bg-slate-800 py-4 font-bold text-white hover:bg-slate-700 transition-colors"
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

function ResultCard({
  title,
  items,
  icon: Icon,
}: {
  title: string;
  items: any[];
  icon: any;
}) {
  const successCount = items.filter((i) => i.success).length;
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-slate-500" />
        <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400">
          {title}
        </h4>
      </div>
      <p className="text-2xl font-bold text-white">
        {successCount} / {items.length}
      </p>
      <div className="mt-4 max-h-[200px] overflow-y-auto ui-scrollbar space-y-2">
        {items.map((item, idx) => (
          <div
            key={idx}
            className={clsx(
              "flex items-center gap-2 text-[10px] truncate",
              item.success ? "text-emerald-400" : "text-rose-400",
            )}
          >
            {item.success ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <AlertCircle className="h-3 w-3" />
            )}
            <span className="truncate">{item.name}</span>
            {item.note && (
              <span className="ml-auto text-[8px] font-bold uppercase tracking-widest opacity-50 px-1.5 py-0.5 rounded-full bg-white/5">
                {item.note}
              </span>
            )}
            {!item.success && item.error && (
              <span className="ml-auto text-[8px] font-bold uppercase tracking-widest text-rose-400">
                {item.error}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
