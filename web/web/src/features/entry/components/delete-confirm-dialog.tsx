import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"

interface DeleteConfirmDialogProps {
  name: string | null
  currentPath: string
  onClose: () => void
  onDelete: (fullPath: string) => void
}

export function DeleteConfirmDialog({
  name,
  currentPath,
  onClose,
  onDelete,
}: DeleteConfirmDialogProps) {
  return (
    <AlertDialog
      open={name !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name}</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{name}"? This action cannot be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              if (name) {
                const fullPath = currentPath ? `${currentPath}/${name}` : name
                onDelete(fullPath)
                onClose()
              }
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
