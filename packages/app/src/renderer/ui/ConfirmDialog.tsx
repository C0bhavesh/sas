import { Dialog } from './Dialog';

/** A yes/no question. The confirm button has focus, so Enter confirms and Esc cancels. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog title={title} onClose={onCancel}>
      <p>{message}</p>
      <button className="primary" onClick={onConfirm}>
        {confirmLabel}
      </button>{' '}
      <button onClick={onCancel}>{cancelLabel}</button>
    </Dialog>
  );
}
