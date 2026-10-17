// 구름멍 날씨 중계 함수 (Vercel Serverless Function)
// 노르웨이 기상청(MET Norway) 데이터를 도시별로 받아 앱에 전달해요.
// 결과는 Vercel이 30분 동안 저장해두고 모든 사용자에게 나눠주기 때문에,
// 사용자가 아무리 많아도 기상청에는 30분에 한 번 정도만 요청이 가요.

// 기상청 이용 규칙: 요청마다 앱 이름과 연락처(이메일이나 웹사이트 주소)를 밝혀야 해요.
// 저장소 이름을 gureummeong이 아닌 다른 이름으로 만들었다면 아래 주소도 같이 바꿔주세요.
const CONTACT = 'https://github.com/lgm500338/gureummeong';
const USER_AGENT = `gureummeong/1.0 (${CONTACT})`;

const CITIES = {
  jeju: [33.36, 126.53],
  seoul: [37.55, 126.99],
  gwangju: [35.13, 126.99],
  busan: [35.16, 129.16],
  tokyo: [35.68, 139.77],
  london: [51.51, -0.12],
  paris: [48.86, 2.29],
  alps: [46.54, 7.96],
  reykjavik: [64.15, -21.94],
  newyork: [40.78, -73.97],
  honolulu: [21.28, -157.83],
  queenstown: [-45.03, 168.66],
};

async function fetchCity(lat, lon) {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${lat}&lon=${lon}`;
  const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!r.ok) throw new Error('met.no ' + r.status);
  const j = await r.json();
  const series = (j.properties && j.properties.timeseries) || [];
  const now = Date.now() - 30 * 60 * 1000;
  const entry = series.find((s) => new Date(s.time).getTime() >= now) || series[0];
  if (!entry) throw new Error('no data');
  const d = entry.data.instant.details;
  const n1 = entry.data.next_1_hours || {};
  const round = (v) => Math.round(v || 0);
  return {
    low: round(d.cloud_area_fraction_low),
    mid: round(d.cloud_area_fraction_medium),
    high: round(d.cloud_area_fraction_high),
    total: round(d.cloud_area_fraction),
    wind: Math.round((d.wind_speed || 0) * 10) / 10,
    windFrom: round(d.wind_from_direction),
    precip: (n1.details && n1.details.precipitation_amount) || 0,
    symbol: (n1.summary && n1.summary.symbol_code) || '',
  };
}

module.exports = async (req, res) => {
  const entries = await Promise.all(
    Object.entries(CITIES).map(async ([id, [lat, lon]]) => {
      try {
        return [id, await fetchCity(lat, lon)];
      } catch (e) {
        return [id, null];
      }
    })
  );
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
  res.status(200).json({ updated: new Date().toISOString(), cities: Object.fromEntries(entries) });
};
