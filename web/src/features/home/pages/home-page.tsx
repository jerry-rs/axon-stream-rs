import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUploadEntry } from "@/features/entry/hooks/use-upload-entry";
import { EntryBreadcrumb } from "@/features/entry/components/entry-breadcrumb";
import { EntryTable } from "@/features/entry/components/entry-table";

export function HomePage() {
  const [currentPath, setCurrentPath] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useUploadEntry(currentPath);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files) return;
    for (const file of files) {
      uploadMutation.mutate(file);
    }
    // 允许重复选择同一文件
    event.target.value = "";
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card flex items-center justify-between gap-4 rounded-lg border px-4 py-2">
        <EntryBreadcrumb
          currentPath={currentPath}
          onPathChange={setCurrentPath}
        />
        <Input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
        {/* 上传进度在 toast 中呈现，按钮保持可用以便继续排队上传 */}
        <Button size="sm" onClick={() => inputRef.current?.click()}>
          <Upload />
          Upload
        </Button>
      </div>
      <div className="bg-card rounded-lg border">
        <EntryTable currentPath={currentPath} onPathChange={setCurrentPath} />
      </div>
    </div>
  );
}
