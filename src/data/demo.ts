/** Fixed identifiers for the sandbox: the two hospitals and the sample sign-ins. Nothing here is a patient record. */

export const FACILITY = { name: 'District Hospital, Gorakhpur', hfr: 'IN2900011882' };

export const OTHER_FACILITY = { name: 'Civil Hospital, Lucknow', hfr: 'IN0900022991' };
export const OTHER_DOCTOR = { id: '71-6100-2255-3094' };

export const CREDENTIALS = {
  doctor: { id: '71-3304-9082-1176', facility: FACILITY.hfr, otp: '482915', name: 'Dr. Meenakshi Srivastava', line: 'Reg. 98761 · General Medicine' },
  nurse: { id: '71-5521-0044-8730', facility: FACILITY.hfr, otp: '482915', name: 'Sr. Kavita Mishra', line: 'Staff Nurse · OPD 3' },
  patient: { abha: '14-7004-8821-5590', otp: '482915' },
};

/** The two patients whose records exist. Shown on the doctor and nurse screens so a tester can use them. */
export const SAMPLE_PATIENTS = [
  { name: 'Mr. Rajesh Kumar Singh', abha: '91-2612-3348-1056' },
  { name: 'Mrs. Savitri Devi Pandey', abha: '14-7004-8821-5590' },
];
