/** Candidate wording for the shared task statuses (same colours as everywhere else). */
export const CANDIDATE_STATUS = {
  assigned: { label: 'To do', className: 'bg-blue-100 text-blue-700' },
  not_started: { label: 'To do', className: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'In progress', className: 'bg-yellow-100 text-yellow-700' },
  submitted: { label: 'Awaiting review', className: 'bg-purple-100 text-purple-700' },
  revision_needed: { label: 'Changes requested', className: 'bg-orange-100 text-orange-700' },
  completed: { label: 'Approved', className: 'bg-green-100 text-green-700' },
};

/** The same input style the mentee submit screens use. */
export const candidateField = 'w-full px-3 py-2 border border-slate-200 rounded-xl bg-card text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
