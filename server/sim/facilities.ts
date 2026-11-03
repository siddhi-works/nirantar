/** The hospitals the simulator knows. HFR ids are made up for the simulator. */
export const FACILITIES: Record<string, string> = {
  IN2900011882: 'District Hospital, Gorakhpur',
  IN0900022991: 'Civil Hospital, Lucknow',
};
export const facilityName = (hfr: string) => FACILITIES[hfr] ?? hfr;
