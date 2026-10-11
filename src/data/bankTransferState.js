// Changes to a report, attachment or decision invalidate an older review.
// Counts also support saved transfers created before optional proofs existed.
export function getTransferRevision(transfer) {
  return (transfer?.reports?.length || 0) + (transfer?.proofs?.length || 0) + (transfer?.decisions?.length || 0);
}

// New ID-based transfers can be checked against a bank entry without requiring
// the participant to report or upload anything. Older report-based flows stay
// compatible. The server still requires an explicit credit match and revision.
export function canReviewBankTransfer(transfer) {
  return Boolean(transfer && (
    (transfer.status === 'under_review' && (transfer.proofs?.length || transfer.reports?.length))
    || (transfer.flowVersion === 3 && transfer.status === 'awaiting_transfer')
  ));
}
