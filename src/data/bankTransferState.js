// Changes to a report, attachment or decision invalidate an older review.
// Counts also support saved transfers created before optional proofs existed.
export function getTransferRevision(transfer) {
  return (transfer?.reports?.length || 0) + (transfer?.proofs?.length || 0) + (transfer?.decisions?.length || 0);
}
