import {
  File,
  FileArchive,
  FileCode,
  FileImage,
  FileMusic,
  FileSpreadsheet,
  FileText,
  FileVideoCamera,
  Folder,
  Link2,
  type LucideIcon,
} from "lucide-react";
import type { EntryItem } from "@/features/entry/api/entry";
import { VIDEO_EXTS } from "@/features/entry/utils/media";

const BASE_CLASS = "size-4 shrink-0";
const MUTED_CLASS = `${BASE_CLASS} text-muted-foreground`;

const AUDIO_EXTS = new Set([
  "mp3", "wav", "flac", "ogg", "m4a", "aac", "opus", "wma", "aiff",
]);
const IMAGE_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif", "heic",
  "heif", "tiff",
]);
const ARCHIVE_EXTS = new Set([
  "zip", "rar", "7z", "tar", "gz", "bz2", "xz", "tgz",
]);
const SPREADSHEET_EXTS = new Set(["xls", "xlsx", "csv", "ods", "numbers"]);
const CODE_EXTS = new Set([
  "js", "jsx", "tsx", "rs", "py", "go", "java", "kt", "swift", "rb", "php",
  "c", "h", "cpp", "hpp", "cs", "html", "css", "scss", "vue", "svelte",
  "json", "yml", "yaml", "toml", "xml", "sh", "sql",
]);
const TEXT_EXTS = new Set(["txt", "md", "markdown", "log", "doc", "docx", "rtf"]);
const PDF_EXTS = new Set(["pdf"]);

interface FileIconRule {
  exts: ReadonlySet<string>;
  icon: LucideIcon;
  className?: string;
}

// 顺序即优先级，命中的第一条规则生效
const FILE_ICON_RULES: FileIconRule[] = [
  { exts: PDF_EXTS, icon: FileText, className: `${BASE_CLASS} text-red-500` },
  { exts: VIDEO_EXTS, icon: FileVideoCamera },
  { exts: AUDIO_EXTS, icon: FileMusic },
  { exts: IMAGE_EXTS, icon: FileImage },
  { exts: ARCHIVE_EXTS, icon: FileArchive },
  { exts: SPREADSHEET_EXTS, icon: FileSpreadsheet },
  { exts: CODE_EXTS, icon: FileCode },
  { exts: TEXT_EXTS, icon: FileText },
];

export function EntryIcon({ item }: { item: EntryItem }) {
  if (item.entryType === "d") {
    return <Folder className="text-primary size-4 shrink-0" />;
  }
  if (item.entryType === "l") {
    return <Link2 className="text-muted-foreground size-4 shrink-0" />;
  }
  const ext = item.ext.toLowerCase().replace(/^\./, "");
  const rule = FILE_ICON_RULES.find((r) => r.exts.has(ext));
  const Icon = rule?.icon ?? File;
  return <Icon className={rule?.className ?? MUTED_CLASS} />;
}
