// File: /api/create-daily-summary.js (JavaScript Version)

import { createClient } from '@supabase/supabase-js';

// --- (1) ตรวจสอบ Environment Variables ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("[Cron Job] FATAL: Supabase URL or Key is missing in environment variables!");
  // (ควร return Response Error ที่นี่)
  // For Vercel Serverless Functions, returning response is standard
  // Using Node.js standard response object if preferred
   return new Response(JSON.stringify({ error: "Missing Supabase configuration" }), { status: 500 });

}

// สร้าง Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

// (ลบ Type ': any' ออกจาก request, response)
export default async function handler(request, response) {

  // --- (2) คำนวณ "เมื่อวาน" แบบไทย ---
  const now = new Date();
  const nowInThaiString = now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' });
  const nowInThai = new Date(nowInThaiString);
  const yesterdayInThai = new Date(nowInThai);
  yesterdayInThai.setDate(nowInThai.getDate() - 1);
  const reportDate = yesterdayInThai.toISOString().split('T')[0];
  // --- ✅ FIX ENDS ---

  console.log(`[Cron Job] Starting summary calculation for Thai date: ${reportDate}`);

  try {
    // --- (3) เรียกใช้ฟังก์ชัน SQL ---
    const { data: summaryResult, error: rpcError } = await supabase
      .rpc('get_daily_summary', { report_date: reportDate });

    if (rpcError) {
      console.error(`[Cron Job] Supabase RPC Error for ${reportDate}:`, rpcError);
      throw new Error(`RPC failed: ${rpcError.message}`);
    }

    // --- (4) ตรวจสอบผลลัพธ์จาก SQL ---
    if (!summaryResult || !Array.isArray(summaryResult) || summaryResult.length === 0) {
      console.log(`[Cron Job] No data returned from RPC for ${reportDate} (likely no raw data for that day). Exiting.`);
      // ใช้ response object มาตรฐานของ Vercel/Node.js
      return response.status(200).json({ success: true, message: `No raw data found to summarize for ${reportDate}` });
    }

    const summary = summaryResult[0];
    console.log(`[Cron Job] Calculated summary for ${reportDate}:`, summary);

    // --- (5) บันทึกข้อมูลลง daily_summary ---
    const { data: upsertData, error: upsertError } = await supabase
      .from('daily_summary')
      .upsert({
        summary_date: reportDate,
        total_energy_kwh: summary.final_total_energy_kwh,
        avg_co2_reduced_ppm: summary.final_avg_co2_reduced_ppm,
        avg_efficiency_percentage: summary.final_avg_efficiency_percentage,
        avg_ph_wolffia: summary.final_avg_ph_wolffia,
        avg_ph_shells: summary.final_avg_ph_shells,
        avg_temp_solar_front: summary.final_avg_temp_solar_front,
        warnings_count: summary.final_warnings_count,
      })
      .select();

    if (upsertError) {
      console.error(`[Cron Job] Supabase Upsert Error for ${reportDate}:`, upsertError);
      throw new Error(`Upsert failed: ${upsertError.message}`);
    }

    // --- (6) สำเร็จ ---
    console.log(`[Cron Job] Successfully created/updated daily summary for ${reportDate}:`, upsertData);
    return response.status(200).json({ success: true, summary_date: reportDate, data: upsertData });

  } catch (error) { // (ลบ Type ': any' ออก)
    // --- (7) จัดการ Error ทั้งหมด ---
    console.error(`[Cron Job] Overall failure for ${reportDate}:`, error);
    return response.status(500).json({
        success: false,
        error: 'Cron job failed',
        details: error.message || 'Unknown error', // ใช้ error.message
        date: reportDate
    });
  }
}