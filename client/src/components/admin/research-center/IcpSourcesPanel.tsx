import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Loader2, X } from "@/components/icons/themed-icons";
import {
  IconPlus, IconExternalLink,
  IconLink, IconFile, IconFileText, IconUpload, IconGlobe,
} from "@/components/icons";
import type { IcpSources, UrlSource } from "./icp-types";
import { formatFileSize } from "./research-shared";

interface IcpSourcesPanelProps {
  sources: IcpSources;
  filteredUrls: UrlSource[];
  newUrl: string;
  setNewUrl: (v: string) => void;
  newLabel: string;
  setNewLabel: (v: string) => void;
  urlSearch: string;
  setUrlSearch: (v: string) => void;
  driveUrl: string;
  setDriveUrl: (v: string) => void;
  driveName: string;
  setDriveName: (v: string) => void;
  isUploading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  updateMutationPending: boolean;
  onAddUrl: () => void;
  onRemoveUrl: (id: string) => void;
  onLocalFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAddGoogleDrive: () => void;
  onRemoveFile: (id: string) => void;
  onToggleUnrestricted: (v: boolean) => void;
}

export function IcpSourcesPanel({
  sources, filteredUrls,
  newUrl, setNewUrl, newLabel, setNewLabel,
  urlSearch, setUrlSearch,
  driveUrl, setDriveUrl, driveName, setDriveName,
  isUploading, fileInputRef, updateMutationPending,
  onAddUrl, onRemoveUrl, onLocalFileSelect, onAddGoogleDrive, onRemoveFile,
  onToggleUnrestricted,
}: IcpSourcesPanelProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border/50">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium flex items-center gap-1.5">
            <IconGlobe className="w-3.5 h-3.5 text-muted-foreground" />
            Allow Unrestricted Search
          </Label>
          <p className="text-xs text-muted-foreground">
            When enabled, the AI can search beyond the listed sources. When disabled, research is restricted to sources below.
          </p>
        </div>
        <Switch checked={sources.allowUnrestricted ?? false} onCheckedChange={onToggleUnrestricted} data-testid="switch-allow-unrestricted" />
      </div>

      <div>
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <IconLink className="w-4 h-4 text-muted-foreground" />
          URL Sources
        </h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          Hospitality industry databases, market reports, investment research (STR, HVS, CBRE, PKF).
        </p>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">URL</Label>
          <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://example.com/market-report" className="h-9 text-xs bg-card" onKeyDown={(e) => e.key === "Enter" && onAddUrl()} data-testid="input-new-url" />
        </div>
        <div className="w-48 space-y-1">
          <Label className="text-xs">Label (optional)</Label>
          <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Market Report 2025" className="h-9 text-xs bg-card" onKeyDown={(e) => e.key === "Enter" && onAddUrl()} data-testid="input-url-label" />
        </div>
        <Button size="sm" variant="default" onClick={onAddUrl} disabled={!newUrl.trim() || updateMutationPending} className="h-9 text-xs gap-1.5" data-testid="button-add-url">
          <IconPlus className="w-3.5 h-3.5" />
          Add
        </Button>
      </div>

      {sources.urls.length > 3 && (
        <Input value={urlSearch} onChange={(e) => setUrlSearch(e.target.value)} placeholder="Search sources..." className="h-8 text-xs bg-muted/30" data-testid="input-search-urls" />
      )}

      {filteredUrls.length > 0 ? (
        <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
          {filteredUrls.map((source) => (
            <div key={source.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border/60 bg-muted/20 group hover:bg-muted/40 transition-colors" data-testid={`url-source-${source.id}`}>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <IconGlobe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">{source.label}</p>
                  <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline truncate block">{source.url}</a>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                  <IconExternalLink className="w-3.5 h-3.5" />
                </a>
                <Button variant="ghost" onClick={() => onRemoveUrl(source.id)} className="text-muted-foreground hover:text-destructive h-auto w-auto p-0.5 opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`remove-url-${source.id}`}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-6 text-muted-foreground">
          <IconLink className="w-6 h-6 mx-auto mb-2 opacity-30" />
          <p className="text-xs">No URL sources added yet</p>
        </div>
      )}

      <div className="pt-4 border-t border-border/40">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <IconFile className="w-4 h-4 text-muted-foreground" />
          File Sources
        </h4>
        <p className="text-xs text-muted-foreground mt-0.5">Upload documents or add Google Drive links.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2 p-3 rounded-lg border border-dashed border-border/60 bg-muted/10">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <IconUpload className="w-3.5 h-3.5" />
            Local Files
          </Label>
          <input ref={fileInputRef} type="file" multiple onChange={onLocalFileSelect} className="hidden" accept=".png,.jpg,.jpeg,.gif,.webp,.svg,.bmp,.tiff" data-testid="input-file-upload" />
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="w-full text-xs h-8 gap-1.5" data-testid="button-upload-local">
            {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <IconUpload className="w-3.5 h-3.5" />}
            {isUploading ? "Uploading..." : "Choose Files"}
          </Button>
          <p className="text-[10px] text-muted-foreground">PNG, JPEG, GIF, WebP, SVG, BMP, TIFF</p>
        </div>

        <div className="space-y-2 p-3 rounded-lg border border-dashed border-border/60 bg-muted/10">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7z" />
              <polyline points="14,2 14,8 20,8" />
            </svg>
            Google Drive
          </Label>
          <Input value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)} placeholder="https://drive.google.com/file/d/..." className="h-8 text-xs bg-card" data-testid="input-drive-url" />
          <div className="flex gap-1.5">
            <Input value={driveName} onChange={(e) => setDriveName(e.target.value)} placeholder="File name (optional)" className="h-8 text-xs bg-card flex-1" data-testid="input-drive-name" />
            <Button size="sm" variant="outline" onClick={onAddGoogleDrive} disabled={!driveUrl.trim() || updateMutationPending} className="h-8 text-xs gap-1" data-testid="button-add-drive">
              <IconPlus className="w-3 h-3" />
              Add
            </Button>
          </div>
        </div>
      </div>

      {sources.files.length > 0 && (
        <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
          {sources.files.map((file) => (
            <div key={file.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border/60 bg-muted/20 group hover:bg-muted/40 transition-colors" data-testid={`file-source-${file.id}`}>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {file.origin === "google-drive" ? (
                  <svg className="w-3.5 h-3.5 text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7z" />
                    <polyline points="14,2 14,8 20,8" />
                  </svg>
                ) : (
                  <IconFileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">{file.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {file.origin === "google-drive" ? "Google Drive" : "Local upload"}
                    {file.size > 0 && ` · ${formatFileSize(file.size)}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {file.driveUrl && (
                  <a href={file.driveUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                    <IconExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                <Button variant="ghost" onClick={() => onRemoveFile(file.id)} className="text-muted-foreground hover:text-destructive h-auto w-auto p-0.5 opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`remove-file-${file.id}`}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
