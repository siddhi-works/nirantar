/** The hospitals the simulator knows. HFR ids are made up for the simulator. */
export const FACILITIES: Record<string, string> = {
  IN2900011882: 'All India Institute of Medical Sciences, Gorakhpur',
  IN0900022991: 'Patna Medical College & Hospital, Patna',
};
export const facilityName = (hfr: string) => FACILITIES[hfr] ?? hfr;
