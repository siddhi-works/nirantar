/**
 * Sample content for the parts of a hospital screen that are not clinical: reminders, the clinic timetable and the day's appointment
 * book. It is made up, shown with a "Sample" label, and never feeds a queue count, a waiting time or any value in a record.
 */
const day = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return d; };
const at = (offset: number, h: number, m = 0) => { const d = day(offset); d.setHours(h, m, 0, 0); return d; };
export const sampleDay = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export interface SampleNote { id: string; title: string; text: string; when: Date; tone: 'info' | 'ok' | 'warn' }
export interface SampleSlot { id: string; time: Date; name: string; reason: string; with: string }
export interface SampleShift { who: string; role: string; hours: string; room: string }

export const STAFF_NOTES: SampleNote[] = [
  { id: 'n1', title: 'Blood sugar kit restocked', text: 'The pathology counter has new test strips for the afternoon session.', when: at(0, 8, 40), tone: 'ok' },
  { id: 'n2', title: 'Eye clinic visiting day', text: 'The retina specialist visits on Thursday. Refer patients who are due for an eye check.', when: at(0, 9, 5), tone: 'info' },
  { id: 'n3', title: 'Network maintenance', text: 'The records server may be slow between 2 and 3 pm.', when: at(0, 9, 30), tone: 'warn' },
  { id: 'n4', title: 'Diabetes awareness camp', text: 'Volunteers are needed at the camp on Saturday morning.', when: at(-1, 17, 15), tone: 'info' },
];

export const SHIFTS: SampleShift[] = [
  { who: 'Dr. Swati Mani', role: 'General Medicine', hours: 'Morning', room: 'Room 4' },
  { who: 'Dr. Arvind Nair', role: 'General Medicine', hours: 'Afternoon', room: 'Room 4' },
  { who: 'Nurse Kavita Yadav', role: 'OPD nursing', hours: 'All day', room: 'Triage desk' },
  { who: 'Lab counter', role: 'Pathology', hours: 'Until the afternoon', room: 'Ground floor' },
];

export const APPOINTMENTS: SampleSlot[] = [
  { id: 'a1', time: at(0, 9, 30), name: 'Ramesh Chandra Gupta', reason: 'Follow-up visit', with: 'Dr. Mani' },
  { id: 'a2', time: at(0, 10, 0), name: 'Sunita Kumari Verma', reason: 'Follow-up visit', with: 'Dr. Mani' },
  { id: 'a3', time: at(0, 10, 30), name: 'Mohammed Irfan Ansari', reason: 'Prescription refill', with: 'Dr. Mani' },
  { id: 'a4', time: at(0, 11, 15), name: 'Lata Devi Mishra', reason: 'Report review', with: 'Dr. Mani' },
  { id: 'a5', time: at(0, 14, 15), name: 'Harish Prasad Tiwari', reason: 'Follow-up visit', with: 'Dr. Nair' },
  { id: 'a6', time: at(1, 9, 45), name: 'Geeta Rani Pathak', reason: 'First visit', with: 'Dr. Mani' },
];

export const PATIENT_NOTES: SampleNote[] = [
  { id: 'p1', title: 'Your next visit', text: 'Please bring your last reports and your medicines to the clinic.', when: at(-1, 18, 0), tone: 'info' },
  { id: 'p2', title: 'Walking reminder', text: 'A short walk after your evening meal helps keep sugar steady.', when: at(0, 7, 30), tone: 'ok' },
  { id: 'p3', title: 'Clinic timing', text: 'The OPD at your hospital is open from 9 am to 5 pm, Monday to Saturday.', when: at(-2, 12, 0), tone: 'info' },
];

export const PATIENT_APPOINTMENT = { when: at(14, 10, 30), with: 'Dr. Swati Mani', where: 'OPD Room 4', note: 'Fast for 8 hours before the visit if blood tests are planned.' };
