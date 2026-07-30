import { useState } from "react";
import { Download, Eye, MoreHorizontal, Play, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { EntryItem } from "@/features/entry/api/entry";
import { EntryIcon } from "@/features/entry/components/entry-icon";
import { EntryImage } from "@/features/entry/components/entry-image";
import { EntryVideo } from "@/features/entry/components/entry-video";
import { useDeleteEntry } from "@/features/entry/hooks/use-delete-entry";
import { useDownloadEntry } from "@/features/entry/hooks/use-download-entry";
import { useEntries } from "@/features/entry/hooks/use-entries";
import {
  entryTypeLabel,
  formatExt,
  formatSize,
  formatTime,
} from "@/features/entry/utils/format";
import { isImageEntry, isVideoEntry } from "@/features/entry/utils/media";

const COLUMN_COUNT = 9;

interface EntryTableProps {
  /** 当前目录的相对路径，用于请求列表和拼接子目录完整路径 */
  currentPath: string;
  onPathChange: (path: string) => void;
}

export function EntryTable({ currentPath, onPathChange }: EntryTableProps) {
  const { data: items, isPending, error } = useEntries(currentPath);
  const deleteMutation = useDeleteEntry(currentPath);
  const downloadMutation = useDownloadEntry(currentPath);
  const [pendingDelete, setPendingDelete] = useState<EntryItem | null>(null);
  /** 正在播放的视频完整相对路径；null 表示播放器关闭 */
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  /** 正在查看的图片完整相对路径；null 表示查看器关闭 */
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  function confirmDelete() {
    if (!pendingDelete) return;
    deleteMutation.mutate(pendingDelete.name);
    setPendingDelete(null);
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 text-center">#</TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="text-center">Ext</TableHead>
            <TableHead className="text-center">Type</TableHead>
            <TableHead className="text-center">Size</TableHead>
            <TableHead className="hidden text-center lg:table-cell">
              Created
            </TableHead>
            <TableHead className="hidden text-center lg:table-cell">
              Modified
            </TableHead>
            <TableHead className="hidden text-center lg:table-cell">
              Accessed
            </TableHead>
            <TableHead className="text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending && (
            <TableRow>
              <TableCell
                colSpan={COLUMN_COUNT}
                className="text-muted-foreground h-24 text-center"
              >
                loading…
              </TableCell>
            </TableRow>
          )}

          {!isPending && error && (
            <TableRow>
              <TableCell
                colSpan={COLUMN_COUNT}
                className="text-destructive h-24 text-center"
              >
                {error.message}
              </TableCell>
            </TableRow>
          )}

          {!isPending && !error && items?.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={COLUMN_COUNT}
                className="text-muted-foreground h-24 text-center"
              >
                Empty directory
              </TableCell>
            </TableRow>
          )}

          {items?.map((item, index) => {
            const fullPath = currentPath
              ? `${currentPath}/${item.name}`
              : item.name;
            const isVideo = isVideoEntry(item);
            const isImage = isImageEntry(item);
            return (
            <TableRow key={item.name}>
              <TableCell className="text-muted-foreground text-center">
                {index + 1}
              </TableCell>
              <TableCell>
                {item.entryType === "d" ? (
                  <button
                    type="button"
                    title={item.name}
                    className="inline-flex max-w-56 cursor-pointer items-center gap-2 font-medium hover:underline sm:max-w-72 lg:max-w-96"
                    onClick={() => onPathChange(fullPath)}
                  >
                    <EntryIcon item={item} />
                    <span className="truncate">{item.name}</span>
                  </button>
                ) : isVideo ? (
                  <button
                    type="button"
                    title={item.name}
                    className="inline-flex max-w-56 cursor-pointer items-center gap-2 font-medium hover:underline sm:max-w-72 lg:max-w-96"
                    onClick={() => setPlayingVideo(fullPath)}
                  >
                    <EntryIcon item={item} />
                    <span className="truncate">{item.name}</span>
                  </button>
                ) : isImage ? (
                  <button
                    type="button"
                    title={item.name}
                    className="inline-flex max-w-56 cursor-pointer items-center gap-2 font-medium hover:underline sm:max-w-72 lg:max-w-96"
                    onClick={() => setViewingImage(fullPath)}
                  >
                    <EntryIcon item={item} />
                    <span className="truncate">{item.name}</span>
                  </button>
                ) : (
                  <span
                    title={item.name}
                    className="inline-flex max-w-56 items-center gap-2 sm:max-w-72 lg:max-w-96"
                  >
                    <EntryIcon item={item} />
                    <span className="w-60 truncate">{item.name}</span>
                  </span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground text-center">
                {formatExt(item.ext)}
              </TableCell>
              <TableCell className="text-muted-foreground text-center">
                {entryTypeLabel(item.entryType)}
              </TableCell>
              <TableCell className="text-muted-foreground text-center tabular-nums">
                {/*{item.entryType === "d" ? "-" : formatSize(item.size)}*/}
                 {formatSize(item.size)}
              </TableCell>
              <TableCell className="text-muted-foreground hidden text-center tabular-nums lg:table-cell">
                {formatTime(item.created)}
              </TableCell>
              <TableCell className="text-muted-foreground hidden text-center tabular-nums lg:table-cell">
                {formatTime(item.modified)}
              </TableCell>
              <TableCell className="text-muted-foreground hidden text-center tabular-nums lg:table-cell">
                {formatTime(item.accessed)}
              </TableCell>
              <TableCell className="text-center">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button variant="ghost" size="icon-sm" title="Actions" />
                    }
                  >
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isVideo && (
                      <DropdownMenuItem onClick={() => setPlayingVideo(fullPath)}>
                        <Play />
                        Play
                      </DropdownMenuItem>
                    )}
                    {isImage && (
                      <DropdownMenuItem onClick={() => setViewingImage(fullPath)}>
                        <Eye />
                        View
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => downloadMutation.mutate(item.name)}
                    >
                      <Download />
                      Download
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={deleteMutation.isPending}
                      onClick={() => setPendingDelete(item)}
                    >
                      <Trash2 />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <EntryVideo
        path={playingVideo}
        onClose={() => setPlayingVideo(null)}
      />

      <EntryImage
        path={viewingImage}
        onClose={() => setViewingImage(null)}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete this{" "}
              {pendingDelete ? entryTypeLabel(pendingDelete.entryType) : "entry"}
              ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{pendingDelete?.name}&quot; will be permanently deleted
              {pendingDelete?.entryType === "d"
                ? ", including all of its contents"
                : ""}
              . This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
