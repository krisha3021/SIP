/**
 * Directory of SEBI-registered mutual funds (AMCs).
 *
 * Source of record: SEBI, "Registered Mutual Funds" (intermediary register, category id 23), read in full on
 * 2026-10-21 — 61 entries. Name, registration number, registration date and registered address come from that
 * register (addresses lightly tidied: empty comma fields and repeated city names removed); `displayName` is Lakshya's readable form of the SEBI name.
 *
 * `website` is recorded only where Lakshya opened the URL on 2026-10-21 over HTTPS and the page identified itself as
 * that mutual fund. Anything not verified is null and shown as "Not recorded" — never guessed.
 *
 * AUM, holdings and ratings are deliberately absent: AMFI's terms bar public display of its data without written
 * permission, and third-party ratings need a licence. See docs/DATA-SOURCES.md.
 */

export const SEBI_MF_REGISTER_URL = 'https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&intmId=23';
export const SEBI_REGISTER_RETRIEVED_ON = '2026-10-21';
export const SEBI_REGISTER_COUNT = 61;
export const WEBSITES_VERIFIED_ON = '2026-10-21';

export interface AmcRecord {
  slug: string;
  /** Name exactly as on the SEBI register. */
  sebiName: string;
  displayName: string;
  registrationNo: string;
  /** ISO date the SEBI registration took effect. */
  registeredOn: string;
  registeredAddress: string;
  /** Verified official website, or null. */
  website: string | null;
  /** Text to search scheme names with (MFAPI). A convenience query, not a claim about the scheme list. */
  searchTerm: string;
}

type Row = [sebiName: string, displayName: string, regNo: string, registeredOn: string, address: string, website: string | null, searchTerm: string];

// prettier-ignore
const ROWS: Row[] = [
  ['360 ONE MUTUAL FUND', '360 ONE Mutual Fund', 'MF/067/11/02', '2011-03-23', '360 One Centre, Kamala City, Senapati Bapat Marg, Lower Parel, Mumbai, MAHARASHTRA, 400013', 'https://www.360.one/asset/mutual-funds/home/', '360 ONE'],
  ['ABAKKUS MUTUAL FUND', 'Abakkus Mutual Fund', 'MF/088/25/14', '2025-08-29', 'Abakkus Corporate Center, 6th Floor, Param House, Shanti Nagar, Off Santacruz Chembur Link Road, Santacruz East, MUMBAI, MAHARASHTRA, 400055', null, 'Abakkus'],
  ['ADITYA BIRLA SUN LIFE MF', 'Aditya Birla Sun Life Mutual Fund', 'MF/020/94/8', '1994-12-23', 'One Indiabulls Centre, Tower 1, 17th Floor, Jupiter Mill Compound, 841, Senapati Bapat Marg, Elphinstone Road, MUMBAI, MAHARASHTRA, 400013', 'https://mutualfund.adityabirlacapital.com/', 'Aditya Birla Sun Life'],
  ['ALPHAGREP MUTUAL FUND', 'AlphaGrep Mutual Fund', 'MF/090/26/16', '2026-03-11', '1408, 14th Floor, Parinee Crescenzo, E, G Block, BKC, Bandra East, MUMBAI, MAHARASHTRA, 400051', null, 'AlphaGrep'],
  ['ANGEL ONE MUTUAL FUND', 'Angel One Mutual Fund', 'MF/083/24/09', '2024-11-25', 'G-1, Ground floor, Ackruti Trade Centre, Road no. 7, Kondivita, MIDC, Andheri East, MUMBAI, MAHARASHTRA, 400093', 'https://www.angelonemf.com/', 'Angel One'],
  ['ASK MUTUAL FUND', 'ASK Mutual Fund', 'MF/089/26/15', '2026-02-16', 'Birla Aurora, 16 Level office, Floor 9, Dr. Annie Besant Road, Century Mill, MUMBAI, MAHARASHTRA, 400030', null, 'ASK'],
  ['AXIS MF', 'Axis Mutual Fund', 'MF/061/09/02', '2009-12-04', 'One Lodha Place, 22 & 23 Floor, Senapati Bapat Marg, Lower Parel, MUMBAI, MAHARASHTRA, 400013', 'https://www.axismf.com/', 'Axis'],
  ['BAJAJ FINSERV MUTUAL FUND', 'Bajaj Finserv Mutual Fund', 'MF/078/23/04', '2023-02-28', '1101A and 1101B, 11th Floor, Sky One Corporate Park, Tower 1, Survey No. 239/2, Sunset Blvd MHADA Colony, Lohegaon, PUNE, MAHARASHTRA, 411032', 'https://www.bajajamc.com/', 'Bajaj Finserv'],
  ['BANDHAN MUTUAL FUND', 'Bandhan Mutual Fund', 'MF/042/00/3', '2000-03-13', '6th Floor, One World Center, Jupiter Mills Compound, 841, Senapati Bapat Marg, Elphinstone Road (West), MUMBAI, MAHARASHTRA, 400013', null, 'Bandhan'],
  ['BANK OF INDIA MUTUAL FUND', 'Bank of India Mutual Fund', 'MF/056/08/01', '2008-03-31', 'B/204, Tower 1, Peninsula Corporate Park, Ganpatrao Kadam Marg, Lower Parel, MUMBAI, MAHARASHTRA, 400013', 'https://www.boimf.in/', 'Bank of India'],
  ['BARODA BNP PARIBAS MUTUAL FUND', 'Baroda BNP Paribas Mutual Fund', 'MF/018/94/2', '1994-11-21', '201(A) 2nd Floor, A wing, Crescenzo, C-38 & 39, G Block, Bandra-Kurla Complex, MUMBAI, MAHARASHTRA, 400051', 'https://www.barodabnpparibasmf.in/', 'Baroda BNP Paribas'],
  ['CANARA ROBECO MF', 'Canara Robeco Mutual Fund', 'MF/004/93/4', '1993-10-19', 'Construction House, 4th Floor, 5, Walchand Hirachand Marg, Ballard Estate, MUMBAI, MAHARASHTRA, 400001', 'https://www.canararobeco.com/', 'Canara Robeco'],
  ['CAPITALMIND MUTUAL FUND', 'Capitalmind Mutual Fund', 'MF/084/25/10', '2025-04-11', '2323 Prakash Arcade 1st Floor, 17th Cross HSR Layout Sector 1, BANGALORE, KARNATAKA, 560102', null, 'Capitalmind'],
  ['CARNELIAN MUTUAL FUND', 'Carnelian Mutual Fund', 'MF/094/26/20', '2026-07-20', '1212 LODHA ONE, SENAPATI BAPAT MARK LOWER PAREL DELISLE ROAD, MUMBAI, MAHARASHTRA, 400013', null, 'Carnelian'],
  ['CHOICE MUTUAL FUND', 'Choice Mutual Fund', 'MF/087/25/13', '2025-08-01', 'Sunil Patodia Tower, MUMBAI, MAHARASHTRA, 400099', 'https://www.choicemf.com/', 'Choice'],
  ['CRB MF', 'CRB Mutual Fund', 'MF/008/93/5', '1993-12-17', 'Daruwala Mansion, 3rd Floor, 90 Chandanwadi Cross Lane, MUMBAI, MAHARASHTRA, 400020', null, 'CRB'],
  ['DSP MF', 'DSP Mutual Fund', 'MF/036/97/7', '1997-01-30', 'The Ruby, 25th Floor, 29, Senapati Bapat Marg, Dadar (West), MUMBAI, MAHARASHTRA, 400028', 'https://www.dspim.com/', 'DSP'],
  ['EDELWEISS MF', 'Edelweiss Mutual Fund', 'MF/057/08/02', '2008-04-30', 'Tower 3, Wing B, Ground Floor, Kohinoor City Mall, Kohinoor City, Kirol Road, Kurla (W), MUMBAI, MAHARASHTRA, 400070', 'https://www.edelweissmf.com/', 'Edelweiss'],
  ['FRANKLIN TEMPLETON MF', 'Franklin Templeton Mutual Fund', 'MF/026/96/8', '1996-02-19', 'One International Centre, Tower 2, 12th and 13th Floor, Senapati Bapat Marg, Elphinstone Road (West), MUMBAI, MAHARASHTRA, 400013', 'https://www.franklintempletonindia.com/', 'Franklin'],
  ['GROWW MUTUAL FUND', 'Groww Mutual Fund', 'MF/068/11/03', '2011-03-24', '1202A - 12A Floor, One World Centre, Lower Parel, MUMBAI, MAHARASHTRA, 400013', 'https://www.growwmf.in/', 'Groww'],
  ['HDFC MF', 'HDFC Mutual Fund', 'MF/044/00/6', '2000-06-30', 'HDFC House, 2nd Floor, H.T. Parekh Marg, 165-166, Backbay Reclamation, Churchgate, MUMBAI, MAHARASHTRA, 400020', 'https://www.hdfcfund.com/', 'HDFC'],
  ['HELIOS MUTUAL FUND', 'Helios Mutual Fund', 'MF/079/23/05', '2023-08-10', '502, 5th Floor, The Capital, Plot C70, Bandra Kurla Complex, Bandra East, MUMBAI, MAHARASHTRA, 400051', null, 'Helios'],
  ['HSBC MF', 'HSBC Mutual Fund', 'MF/046/02/5', '2002-05-27', '3rd Floor, Mercantile Bank Chamber, 16 Veer Nariman Road, Fort, MUMBAI, MAHARASHTRA, 400001', 'https://www.assetmanagement.hsbc.co.in/en', 'HSBC'],
  ['ICICI PRUDENTIAL MF', 'ICICI Prudential Mutual Fund', 'MF/003/93/6', '1993-10-13', '12th Floor, Narain Manzil 23, Barakhamba Road, DELHI, NATIONAL CAPITAL TERRITORY OF DELHI, 110001', 'https://www.icicipruamc.com/', 'ICICI Prudential'],
  ['IDBI MUTUAL FUND', 'IDBI Mutual Fund', 'MF/064/10/01', '2010-03-29', 'IDBI Tower, WTC Complex, Cuffe Parade, MUMBAI, MAHARASHTRA, 400005', null, 'IDBI'],
  ['IIFCL MF (IDF)', 'IIFCL Mutual Fund (IDF)', 'MF/071/13/01', '2013-01-24', '5th Floor, Block-2, Plate-A, NBCC Towers, East Kidwai Nagar, NEW DELHI, NATIONAL CAPITAL TERRITORY OF DELHI, 110023', null, 'IIFCL'],
  ['IL&FS IDF MF', 'IL&FS Infrastructure Debt Fund', 'MF/072/13/02', '2013-02-01', 'IL&FS Infra Asset Management Limited, MUMBAI, MAHARASHTRA, 400051', null, 'IL&FS'],
  ['INVESCO MUTUAL FUND', 'Invesco Mutual Fund', 'MF/052/06/01', '2006-07-24', '2101-A, 21st Floor, Marathon Futurex, Lower Parel, MUMBAI, MAHARASHTRA, 400013', 'https://www.invescomutualfund.com/', 'Invesco India'],
  ['ITI MUTUAL FUND', 'ITI Mutual Fund', 'MF/073/18/01', '2018-05-14', 'ITI House, Building no. 36, Dr. R. K. Shirodkar Marg, Parel, MUMBAI, MAHARASHTRA, 400012', 'https://www.itiamc.com/', 'ITI'],
  ['JIO BLACKROCK MUTUAL FUND', 'JioBlackRock Mutual Fund', 'MF/085/25/11', '2025-05-26', 'Unit No. 1301, 13th Floor, Altimus Building, Plot No. 130, Worli Estate, Pandurang Budhkar Marg, Worli, MUMBAI, MAHARASHTRA, 400018', 'https://www.jioblackrockamc.com/', 'JioBlackRock'],
  ['JM FINANCIAL MF', 'JM Financial Mutual Fund', 'MF/015/94/8', '1994-09-15', '7th Floor, Cnergy, Appasaheb Marathe Marg, Prabhadevi, MUMBAI, MAHARASHTRA, 400025', 'https://www.jmfinancialmf.com/', 'JM'],
  ['KOTAK MUTUAL FUND', 'Kotak Mahindra Mutual Fund', 'MF/038/98/1', '1998-06-23', '27 BKC, C-27, G Block, Bandra Kurla Complex, Bandra (E), MUMBAI, MAHARASHTRA, 400051', 'https://www.kotakmf.com/', 'Kotak'],
  ['LAKSHYA MUTUAL FUND', 'Lakshya Mutual Fund', 'MF/091/26/17', '2026-03-25', 'F-31, 3rd Floor, Commerce House-4, Sur No. 1319/1301/1, 100Ft Road, Anand Nagar Char Rasta, Anand Nagar, Jodhpur Char Rasta, AHMEDABAD, GUJARAT, 380015', null, 'Lakshya'],
  ['LIC MF', 'LIC Mutual Fund', 'MF/012/94/5', '1994-05-09', 'Industrial Assurance Building, 4th Floor, Opposite Churchgate Station, MUMBAI, MAHARASHTRA, 400020', 'https://www.licmf.com/', 'LIC MF'],
  ['MAHINDRA MANULIFE MUTUAL FUND', 'Mahindra Manulife Mutual Fund', 'MF/069/16/01', '2016-02-03', 'Unit No. 204, 2nd Floor, Amiti Building, C Wing, Piramal Agastya Corporate Park, LBS Road, Kamani Junction, Kurla (West), MUMBAI, MAHARASHTRA, 400070', 'https://www.mahindramanulife.com/', 'Mahindra Manulife'],
  ['MARCELLUS MUTUAL FUND', 'Marcellus Mutual Fund', 'MF/095/26/21', '2026-09-29', 'Unit No 416 4th Floor Hubtown Solaris, Near NS Phadke Marg Opp Telli Gully, MUMBAI, MAHARASHTRA, 400069', null, 'Marcellus'],
  ['MIRAE ASSET MF', 'Mirae Asset Mutual Fund', 'MF/055/07/03', '2008-02-20', '606, 6th Floor, Windsor Building, Santacruz (E), MUMBAI, MAHARASHTRA, 400098', 'https://www.miraeassetmf.co.in/', 'Mirae Asset'],
  ['MONARCH MUTUAL FUND', 'Monarch Mutual Fund', 'MF/092/26/18', '2026-04-01', '804, Naman Centre, 8th Floor, G Block, Plot No. C-31 & C-32, Bandra Kurla Complex, Bandra East, MUMBAI, MAHARASHTRA, 400051', null, 'Monarch'],
  ['MOTILAL OSWAL MF', 'Motilal Oswal Mutual Fund', 'MF/063/09/04', '2009-12-29', '10th Floor, Motilal Oswal Tower, Rahimtullah Sayani Road, Opposite Parel ST Depot, Prabhadevi, MUMBAI, MAHARASHTRA, 400025', 'https://www.motilaloswalmf.com/', 'Motilal Oswal'],
  ['N J MUTUAL FUND', 'NJ Mutual Fund', 'MF/076/21/02', '2021-04-30', 'Unit No. 101A, 1st Floor, Hallmark Business Plaza, Bandra (East), MUMBAI, MAHARASHTRA, 400051', 'https://www.njmutualfund.com/', 'NJ'],
  ['NAVI MUTUAL FUND', 'Navi Mutual Fund', 'MF/062/09/03', '2009-12-04', 'Vaishnavi Tech Square, 7th Floor, Iballur Village, Begur Hobli, BANGALORE, KARNATAKA, 560102', 'https://navi.com/mutual-fund', 'Navi'],
  ['NIPPON INDIA MUTUAL FUND', 'Nippon India Mutual Fund', 'MF/022/95/1', '1995-06-30', '30th Floor, One Lodha Place, Senapati Bapat Marg, Lower Parel, MUMBAI, MAHARASHTRA, 400013', 'https://mf.nipponindiaim.com/', 'Nippon India'],
  ['NUVAMA MUTUAL FUND', 'Nuvama Mutual Fund', 'MF/093/26/19', '2026-06-08', '801 804, Wing A, Building No. 3, Inspire BKC, G Block, Bandra Kurla Complex, Bandra East, MUMBAI, MAHARASHTRA, 400051', null, 'Nuvama'],
  ['OLD BRIDGE MUTUAL FUND', 'Old Bridge Mutual Fund', 'MF/081/23/07', '2023-09-01', 'C 1705 One BKC, G Block Bandra Kurla Complex, MUMBAI, MAHARASHTRA, 400051', null, 'Old Bridge'],
  ['PGIM INDIA MUTUAL FUND', 'PGIM India Mutual Fund', 'MF/065/10/02', '2010-05-13', '4th Floor, C Wing, Laxmi Towers, Bandra Kurla Complex, Bandra (East), MUMBAI, MAHARASHTRA, 400051', 'https://www.pgimindia.com/mutual-funds', 'PGIM India'],
  ['PPFAS MF', 'PPFAS Mutual Fund', 'MF/069/12/01', '2012-10-11', '81/82, 8th Floor, Sakhar Bhavan, Ramnath Goenka Marg, 230, Nariman Point, MUMBAI, MAHARASHTRA, 400001', 'https://amc.ppfas.com/', 'Parag Parikh'],
  ['QUANT MUTUAL FUND', 'quant Mutual Fund', 'MF/028/96/4', '1996-07-03', 'Premises No. 2/90, Block-P, Connaught Circus, DELHI, NATIONAL CAPITAL TERRITORY OF DELHI, 110001', 'https://quantmutual.com/', 'quant'],
  ['QUANTUM MF', 'Quantum Mutual Fund', 'MF/051/05/02', '2005-12-02', '1st Floor, Apeejay House, 3 Dinshaw Vachha Road, Backbay Reclamation, Churchgate, MUMBAI, MAHARASHTRA, 400020', 'https://www.quantumamc.com/', 'Quantum'],
  ['SAMCO MUTUAL FUND', 'Samco Mutual Fund', 'MF/077/21/03', '2021-07-30', '1003 A Wing 10th Floor Naman Midtown, Senapati Bapat Marg, MUMBAI, MAHARASHTRA, 400013', 'https://www.samcomf.com/', 'Samco'],
  ['SBI MF', 'SBI Mutual Fund', 'MF/009/93/3', '1993-12-23', '9th Floor, Crescenzo, C-38 & 39, G Block, Bandra Kurla Complex, Bandra (East), MUMBAI, MAHARASHTRA, 400051', 'https://www.sbimf.com/', 'SBI'],
  ['SHRIRAM MF', 'Shriram Mutual Fund', 'MF/017/94/4', '1994-11-21', 'Wockhardt Towers, 2nd Floor, East Wing, C-2, G Block, Bandra Kurla Complex, Bandra (East), MUMBAI, MAHARASHTRA, 400051', 'https://www.shriramamc.in/', 'Shriram'],
  ['SUNDARAM MF', 'Sundaram Mutual Fund', 'MF/034/97/2', '1997-01-03', '21, Patullos Road, CHENNAI, TAMIL NADU, 600002', 'https://www.sundarammutual.com/', 'Sundaram'],
  ['TATA MUTUAL FUND', 'Tata Mutual Fund', 'MF/023/95/9', '1995-06-30', '1903, B Wing, Parinee Crescenzo, G Block, BKC, MUMBAI, MAHARASHTRA, 400051', 'https://www.tatamutualfund.com/', 'Tata'],
  ['TAURUS MF', 'Taurus Mutual Fund', 'MF/002/93/', '1993-09-21', 'Office No. 401, 402, 4th Floor, Jaisingh Business Centre, Sahar Road, Andheri East, MUMBAI, MAHARASHTRA, 400099', 'https://www.taurusmutualfund.com/', 'Taurus'],
  ['THE WEALTH COMPANY MUTUAL FUND', 'The Wealth Company Mutual Fund', 'MF/086/25/12', '2025-07-18', 'Pantomath Nucleus House, Saki Vihar Road, Andheri East, MUMBAI, MAHARASHTRA, 400072', null, 'Wealth Company'],
  ['TRUST MUTUAL FUND', 'TRUST Mutual Fund', 'MF/075/19/01', '2019-10-07', '101, 1st Floor, Naman Corporate Link Centre, G-Block, Bandra Kurla Complex, Bandra East, MUMBAI, MAHARASHTRA, 400051', 'https://www.trustmf.com/', 'TRUSTMF'],
  ['UNIFI MUTUAL FUND', 'Unifi Mutual Fund', 'MF/082/24/08', '2024-11-13', '11, Kakani Towers, 3rd Floor, 15, Khader Nawaz Khan Road, CHENNAI, TAMIL NADU, 600006', 'https://unifimf.com/', 'Unifi'],
  ['UNION MUTUAL FUND', 'Union Mutual Fund', 'MF/066/11/01', '2016-11-08', 'Unit 503, 5th Floor, Leela Business Park, Andheri Kurla Road, Andheri (East), MUMBAI, MAHARASHTRA, 400059', 'https://www.unionmf.com/', 'Union'],
  ['UTI MF', 'UTI Mutual Fund', 'MF/048/03/01', '2003-01-14', 'UTI Tower, GN Block, Bandra Kurla Complex, Bandra (East), MUMBAI, MAHARASHTRA, 400051', 'https://www.utimf.com/', 'UTI'],
  ['WHITEOAK CAPITAL MUTUAL FUND', 'WhiteOak Capital Mutual Fund', 'MF/074/18/02', '2018-07-03', 'Unit No. B, 1st Floor, Cnergy, Appasaheb Marathe Marg, Prabhadevi, MUMBAI, MAHARASHTRA, 400025', 'https://mf.whiteoakamc.com/', 'WhiteOak'],
  ['ZERODHA MUTUAL FUND', 'Zerodha Mutual Fund', 'MF/080/23/06', '2023-08-11', 'Indiqube Penta, New No. 51 (Old No. 14), Richmond Road, BANGALORE, KARNATAKA, 560025', 'https://www.zerodhafundhouse.com/', 'Zerodha'],
];

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const AMCS: readonly AmcRecord[] = ROWS.map(([sebiName, displayName, registrationNo, registeredOn, registeredAddress, website, searchTerm]) => ({
  slug: slugify(displayName),
  sebiName,
  displayName,
  registrationNo,
  registeredOn,
  registeredAddress,
  website,
  searchTerm,
}));

export function getAmc(slug: string): AmcRecord | undefined {
  return AMCS.find((a) => a.slug === slug);
}

/** City as printed in the SEBI address (the field before the state). */
export function amcCity(a: AmcRecord): string {
  const parts = a.registeredAddress
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const city = parts.length >= 3 ? parts[parts.length - 3]! : '';
  return city.charAt(0) + city.slice(1).toLowerCase();
}
