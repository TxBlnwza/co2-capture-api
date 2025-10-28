// pages/api/create-daily-summary.js
import { createClient } from '@supabase/supabase-js'

// อย่า return new Response นอก handler เด็ดขาด
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null

// คืน "YYYY-MM-DD" ของเมื่อวานในโซน Asia/Bangkok แบบไม่พาร์สสตริงย้อน
function getBangkokYesterdayISODate() {
  const tz = 'Asia/Bangkok'
  const now = new Date()
  const y = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  // sv-SE => YYYY-MM-DD
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(y)
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  if (!supabase) {
    console.error('[Cron Job] Missing Supabase config')
    return res.status(500).json({ success: false, error: 'Missing Supabase configuration' })
  }

  const reportDate = getBangkokYesterdayISODate()
  console.log(`[Cron Job] Start daily summary for ${reportDate}`)

  try {
    // 1) เรียก RPC (ต้องแน่ใจว่า RPC คืนคอลัมน์ชื่อ final_* — ดู SQL ด้านล่าง)
    const { data: rows, error: rpcError } = await supabase.rpc('get_daily_summary', {
      report_date: reportDate,
    })
    if (rpcError) {
      console.error('[Cron Job] RPC error', rpcError)
      return res.status(500).json({ success: false, error: rpcError.message })
    }

    if (!rows || rows.length === 0) {
      console.log(`[Cron Job] No raw data for ${reportDate}`)
      return res.status(200).json({ success: true, message: `No raw data for ${reportDate}` })
    }

    const s = rows[0]

    // 2) upsert ลงตารางสรุป (ต้องมี unique index ที่ summary_date)
    const { data: upserted, error: upsertError } = await supabase
      .from('daily_summary')
      .upsert(
        {
          summary_date: reportDate,
          total_energy_kwh: s.final_total_energy_kwh,
          avg_co2_reduced_ppm: s.final_avg_co2_reduced_ppm,
          avg_efficiency_percentage: s.final_avg_efficiency_percentage,
          avg_ph_wolffia: s.final_avg_ph_wolffia,
          avg_ph_shells: s.final_avg_ph_shells,
          avg_temp_solar_front: s.final_avg_temp_solar_front,
          warnings_count: s.final_warnings_count,
        },
        { onConflict: 'summary_date' }
      )
      .select()

    if (upsertError) {
      console.error('[Cron Job] Upsert error', upsertError)
      return res.status(500).json({ success: false, error: upsertError.message })
    }

    console.log(`[Cron Job] Done ${reportDate}`)
    return res.status(200).json({ success: true, summary_date: reportDate, data: upserted })
  } catch (e) {
    console.error('[Cron Job] Fatal error', e)
    return res.status(500).json({ success: false, error: e?.message || 'Unknown error' })
  }
}
