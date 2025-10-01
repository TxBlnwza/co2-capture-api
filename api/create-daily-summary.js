// File: /api/create-daily-summary.js

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(request, response) {
  // คำนวณหาวันที่ของ "เมื่อวาน"
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const reportDate = yesterday.toISOString().split('T')[0]; // Format: YYYY-MM-DD

  try {
    // 1. เรียกใช้ฟังก์ชันผู้ช่วยใน Database ด้วย .rpc()
    console.log(`Requesting summary for date: ${reportDate}`);
    const { data: summaryResult, error: rpcError } = await supabase
      .rpc('get_daily_summary', { report_date: reportDate });

    if (rpcError) throw rpcError;

    // ถ้าไม่มีข้อมูลของเมื่อวาน ก็จบการทำงาน
    if (!summaryResult || summaryResult.length === 0 || summaryResult[0].final_total_energy_kwh === null) {
      console.log(`No data found for ${reportDate}. Exiting.`);
      return response.status(200).json({ message: `No data to summarize for ${reportDate}` });
    }

    const summary = summaryResult[0];

    // 2. นำผลลัพธ์ที่ได้ไปบันทึกลงในตาราง daily_summary
    // .upsert() จะทำการ INSERT ถ้ายังไม่มีข้อมูลของวันนั้น หรือ UPDATE ถ้ามีอยู่แล้ว
    const { data: upsertData, error: upsertError } = await supabase
      .from('daily_summary')
      .upsert({
        summary_date: reportDate,
        total_energy_kwh: summary.final_total_energy_kwh,
        avg_co2_reduced_ppm: summary.final_avg_co2_reduced_ppm,
        avg_ph_wolffia: summary.final_avg_ph_wolffia,
        avg_ph_shells: summary.final_avg_ph_shells,
        avg_temp_solar_front: summary.final_avg_temp_solar_front,
        warnings_count: summary.final_warnings_count,
      })
      .select();

    if (upsertError) throw upsertError;

    console.log('Successfully created daily summary:', upsertData);
    return response.status(200).json({ success: true, summary: upsertData });

  } catch (error) {
    console.error('Cron job failed:', error);
    return response.status(500).json({ error: error.message });
  }
}