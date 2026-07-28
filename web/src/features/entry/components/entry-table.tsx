import { lazy, Suspense, useState } from "react"
import { File, Folder, Link, CircleHelp, Download, Copy, Trash2, Ellipsis } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { AlertCircleIcon } from "lucide-react"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { useEntries } from "@/features/entry/hooks/use-entries"
import { useDeleteEntry } from "@/features/entry/hooks/use-delete-entry"
import { useDownloadEntry } from "@/features/entry/hooks/use-download-entry"
import { cn } from "@/lib/utils"
import { formatSize, formatTimestamp, resolveTypeLabel, isVideo } from "@/features/entry/utils"
import { DeleteConfirmDialog } from "@/features/entry/components/delete-confirm-dialog"
import { Spinner } from "@/components/ui/spinner"

const EntryVideo = lazy(() =>
  import("./entry-video").then((m) => ({ default: m.EntryVideo })),
)

function EntryIcon({ type }: { type: string }) {
  switch (type) {
    case "d":
      return <Folder className="size-4 shrink-0 text-amber-500" />
    case "f":
      return <File className="size-4 shrink-0 text-muted-foreground" />
    case "l":
      return <Link className="size-4 shrink-0 text-blue-500" />
    default:
      return <CircleHelp className="size-4 shrink-0 text-muted-foreground" />
  }
}

interface EntryTableProps {
  currentPath: string
  onNavigate: (path: string) => void
}

const HEADERS = ["#", "Name", "Type", "Size", "Modified", "Created", "Accessed", "Actions"]

export function EntryTable({ currentPath, onNavigate }: EntryTableProps) {
  const { data, isLoading, isError, error } = useEntries(currentPath)
  const deleteMutation = useDeleteEntry(currentPath)
  const downloadMutation = useDownloadEntry()
  const [deletingName, setDeletingName] = useState<string | null>(null)
  const [playingVideo, setPlayingVideo] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Spinner />Loading…
      </div>
    )
  }

  if (isError) {
    return (
      <Alert variant="destructive" className="max-w-md">
        <AlertCircleIcon />
        <AlertTitle>Failed</AlertTitle>
        <AlertDescription>
          {(error as Error).message}
        </AlertDescription>
      </Alert>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        This folder is empty.
      </div>
    )
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            {HEADERS.map((h, i) => (
              <TableHead
                key={h}
                className={cn(
                  (h === "#" || h === "Size" || h === "Type" || h === "Modified" || h === "Created" || h === "Accessed") && "text-center",
                  i === 0 && "sticky left-0 z-10 bg-background",
                  (h === "Modified" || h === "Created" || h === "Accessed") && "hidden sm:table-cell"
                )}
              >
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item, i) => (
            <TableRow
              key={`${item.name}-${i}`}
              className={item.entryType === "d" ? "cursor-pointer" : undefined}
              onClick={() => {
                if (item.entryType === "d") {
                  const next = currentPath
                    ? `${currentPath}/${item.name}`
                    : item.name
                  onNavigate(next)
                } else if (item.entryType === 'f' && isVideo(item.ext)) {
                  const fullPath = currentPath
                    ? `${currentPath}/${item.name}`
                    : item.name
                  setPlayingVideo(fullPath)
                }
              }}
            >
              <TableCell className="sticky left-0 z-10 bg-background text-center">{i + 1}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <EntryIcon type={item.entryType} />
                  <HoverCard>
                    <HoverCardTrigger>
                      <span className="inline-block max-w-sm truncate">{item.name}</span>
                    </HoverCardTrigger>
                    <HoverCardContent>
                      {item.name}
                    </HoverCardContent>
                  </HoverCard>
                </div>
              </TableCell>
              <TableCell className="text-center">
                {resolveTypeLabel(item.entryType)}
              </TableCell>
              <TableCell className="text-center">
                {item.entryType === "d" ? "—" : formatSize(item.size)}
              </TableCell>
              <TableCell className="text-center hidden sm:table-cell">
                {formatTimestamp(item.modified)}
              </TableCell>
              <TableCell className="text-center hidden sm:table-cell">
                {formatTimestamp(item.created)}
              </TableCell>
              <TableCell className="text-center hidden sm:table-cell">
                {formatTimestamp(item.accessed)}
              </TableCell>
              <TableCell className="text-center">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="ghost" size="icon-xs" aria-label="More actions" />}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Ellipsis className="size-3" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenuItem
                      onClick={async () => {
                        const fullPath = currentPath
                          ? `${currentPath}/${item.name}`
                          : item.name
                        const { blob, filename } = await downloadMutation.mutateAsync(fullPath)
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = filename
                        a.click()
                        URL.revokeObjectURL(url)
                      }}
                    >
                      <Download />
                      Download
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={() => {
                        const fullPath = currentPath
                          ? `${currentPath}/${item.name}`
                          : item.name
                        navigator.clipboard.writeText(fullPath)
                      }}
                    >
                      <Copy />
                      Copy Path
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation()
                        setDeletingName(item.name)
                      }}
                    >
                      <Trash2 />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <DeleteConfirmDialog
        name={deletingName}
        currentPath={currentPath}
        onClose={() => setDeletingName(null)}
        onDelete={(fullPath) => deleteMutation.mutate(fullPath)}
      />

      {playingVideo && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
              <div className="flex h-64 items-center justify-center rounded-lg bg-background px-8 text-muted-foreground">
                <Spinner />
              </div>
            </div>
          }
        >
          <EntryVideo
            path={playingVideo}
            onClose={() => setPlayingVideo(null)}
          />
        </Suspense>
      )}
    </>
  )
}
