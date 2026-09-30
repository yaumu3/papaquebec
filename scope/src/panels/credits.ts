/** Something the scope shows, where it comes from, and the terms it is made available under. */
export interface Credit {
  subject: string;
  source: string;
  terms: string;
  url: string;
}

/** The scope itself. */
export const SOFTWARE: Credit = {
  subject: 'CODE',
  source: 'github.com/yaumu3/papaquebec',
  terms: 'MIT',
  url: 'https://github.com/yaumu3/papaquebec',
};

/** What it shows that others made. */
export const CREDITS: readonly Credit[] = [
  {
    subject: 'REGISTRY',
    source: 'Mictronics aircraft database',
    terms: 'ODC-By 1.0',
    url: 'https://github.com/Mictronics/aircraft-database',
  },
  {
    subject: 'AIRSPACE',
    source: 'openAIP',
    terms: 'CC BY-NC-SA 4.0',
    url: 'https://www.openaip.net',
  },
  {
    subject: 'COASTLINE',
    source: 'Natural Earth',
    terms: 'public domain',
    url: 'https://www.naturalearthdata.com',
  },
  {
    subject: 'QNH',
    source: 'Iowa Environmental Mesonet',
    terms: 'METARs of NOAA',
    url: 'https://mesonet.agron.iastate.edu',
  },
  {
    subject: 'TYPEFACE',
    source: 'JetBrains Mono',
    terms: 'SIL OFL 1.1',
    url: 'https://www.jetbrains.com/lp/mono/',
  },
];
