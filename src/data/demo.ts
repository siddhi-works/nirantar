/** Mock dashboard content (frontend-only). None of it refers to the two patients whose records open by ABHA number. */

export const FACILITY = { name: 'District Hospital, Gorakhpur', hfr: 'IN2900011882' };

export const CREDENTIALS = {
  doctor: { id: '71-3304-9082-1176', facility: FACILITY.hfr, otp: '482915', name: 'Dr. Meenakshi Srivastava', line: 'Reg. 98761 · General Medicine' },
  nurse: { id: '71-5521-0044-8730', facility: FACILITY.hfr, otp: '482915', name: 'Sr. Kavita Mishra', line: 'Staff Nurse · OPD 3' },
  patient: { abha: '14-7004-8821-5590', otp: '482915' },
};

export type Kind = 'opd' | 'round' | 'meeting' | 'conference' | 'checkup' | 'lab' | 'break' | 'camp';
export interface Slot { time: string; title: string; sub: string; kind: Kind }

export const KIND_LABEL: Record<Kind, string> = {
  opd: 'OPD', round: 'Ward round', meeting: 'Meeting', conference: 'Conference', checkup: 'Health check-up', lab: 'Lab', break: 'Break', camp: 'Camp',
};

export const DOCTOR_SCHEDULE: Slot[] = [
  { time: '08:30', title: 'Ward round — Medicine Ward B', sub: '14 inpatients · with resident doctors', kind: 'round' },
  { time: '09:30', title: 'Department huddle', sub: 'Bed status and today’s admissions · Conference room 2', kind: 'meeting' },
  { time: '10:00', title: 'Diabetes OPD', sub: '18 booked patients · OPD Room 3', kind: 'opd' },
  { time: '12:30', title: 'Executive health check-up reviews', sub: '6 reports to sign · Health Check-up Wing', kind: 'checkup' },
  { time: '13:15', title: 'Lunch', sub: 'Doctors’ lounge', kind: 'break' },
  { time: '14:00', title: 'Tele-consultations', sub: '5 patients · eSanjeevani', kind: 'opd' },
  { time: '15:00', title: 'CME: Updates in diabetes care', sub: 'Dr. Anand Mehrotra, AIIMS Gorakhpur · Auditorium', kind: 'conference' },
  { time: '16:30', title: 'Medical college teaching round', sub: 'Final-year MBBS · Seminar room', kind: 'meeting' },
  { time: '17:30', title: 'Admissions review', sub: 'Emergency referrals from the evening', kind: 'round' },
];

export const DOCTOR_NOTES: { icon: 'lab' | 'msg' | 'alert' | 'cal'; title: string; sub: string; time: string }[] = [
  { icon: 'alert', title: 'Critical value — Mr. Harish Chandra Gupta', sub: 'Random glucose 342 mg/dL at the OPD desk', time: '9 min ago' },
  { icon: 'lab', title: 'Lab report ready — Mrs. Sunita Tripathi', sub: 'HbA1c and lipid profile', time: '32 min ago' },
  { icon: 'msg', title: 'Message from Mr. Vikas Agrawal', sub: 'Asks to move his review to next week', time: '1 h ago' },
  { icon: 'cal', title: 'Schedule change', sub: 'CME talk moved to 15:00, Auditorium', time: 'Today' },
];

export const NURSE_SCHEDULE: Slot[] = [
  { time: '08:00', title: 'Handover from night shift', sub: 'Medicine Ward B', kind: 'meeting' },
  { time: '08:30', title: 'Ward round support', sub: 'Dr. Srivastava · record vitals on the chart', kind: 'round' },
  { time: '10:00', title: 'OPD vitals desk', sub: 'BP, weight, height for Diabetes OPD · OPD Room 3', kind: 'opd' },
  { time: '12:00', title: 'Sample collection', sub: 'Fasting and post-meal samples · Lab counter', kind: 'lab' },
  { time: '13:15', title: 'Lunch', sub: 'Staff canteen', kind: 'break' },
  { time: '14:00', title: 'Health check-up wing', sub: 'ECG and measurements for 6 executive packages', kind: 'checkup' },
  { time: '15:30', title: 'Foot-care awareness camp', sub: 'Registration desk · Ground-floor hall', kind: 'camp' },
  { time: '16:30', title: 'In-service training', sub: 'Infection control refresher · Seminar room', kind: 'conference' },
];

export const NURSE_TASKS = [
  { id: 'n1', text: 'Scan and file 3 outside lab reports' },
  { id: 'n2', text: 'Restock glucometer strips at OPD desk' },
  { id: 'n3', text: 'Update the foot-camp registration list' },
];

export const NURSE_NOTES: typeof DOCTOR_NOTES = [
  { icon: 'alert', title: 'Repeat BP requested — Mr. Harish Chandra Gupta', sub: 'Recheck after 10 minutes of rest', time: '12 min ago' },
  { icon: 'lab', title: '3 lab reports waiting to be filed', sub: 'Collect from the lab counter', time: '40 min ago' },
  { icon: 'cal', title: 'Foot-care camp this afternoon', sub: 'Registration desk opens at 15:30', time: 'Today' },
];
