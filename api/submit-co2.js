// File: /api/submit-co2.js

// 1. Import Library ของ Supabase
import { createClient } from '@supabase/supabase-js';

// 2. สร้างการเชื่อมต่อกับ Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(request, response) {
  // 3. ป้องกันไม่ให้ Method อื่นนอกจาก POST เข้ามาได้
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 4. ดึงข้อมูลจาก Body ที่ ESP32 ส่งมา
    const { co2_position1_ppm, co2_position2_ppm, co2_position3_ppm } = request.body;

    // 5. ตรวจสอบข้อมูลเบื้องต้น
    if (co2_position1_ppm === undefined || co2_position3_ppm === undefined) {
      return response.status(400).json({ error: 'Missing required CO2 data' });
    }

    // ---------------------------------------------------------
    // 6. ส่วนการคำนวณ (Updated)
    // ---------------------------------------------------------
    
    // 6.1 คำนวณผลต่าง PPM (เข้า - ออก)
    // ppm เข้า = co2_position1_ppm
    // ppm ออก = co2_position3_ppm
    const co2_reduced_ppm_interval = co2_position1_ppm - co2_position3_ppm;

    // 6.2 คำนวณ CO2 Reduced (kg) ตามสูตรในรูปภาพ
    // สูตร: (ppmDiff) * (44 / 24.45) * Volume * 10^-6
    const AIR_VOLUME_M3 = 0.00113; // ค่าปริมาตรอากาศจากที่คุณกำหนด
    const MOLAR_MASS = 44;
    const MOLAR_VOLUME = 24.45;

    const co2_reduced_kg = (co2_reduced_ppm_interval) * (MOLAR_MASS / MOLAR_VOLUME) * AIR_VOLUME_M3 * Math.pow(10, -6);

    // 6.3 คำนวณ Efficiency (%)
    let efficiency_percentage = 0;
    if (co2_position1_ppm && co2_position1_ppm > 0) {
      efficiency_percentage = ((co2_position1_ppm - co2_position3_ppm) / co2_position1_ppm) * 100;
    }

    // 7. บันทึกข้อมูลลงในตาราง co2_data
    const { data, error } = await supabase
      .from('co2_data')
      .insert([
        {
          co2_position1_ppm,
          co2_position2_ppm,
          co2_position3_ppm,
          co2_reduced_ppm_interval, 
          efficiency_percentage,
          co2_reduced_kg, // << เพิ่มฟิลด์ใหม่ที่คำนวณได้ลงไป
        },
      ])
      .select();

    // 8. จัดการ Error หากบันทึกไม่สำเร็จ
    if (error) {
      console.error('Supabase error:', error);
      return response.status(500).json({ error: 'Failed to save data to Supabase' });
    }

    // 9. ส่งคำตอบกลับไปว่าสำเร็จ
    console.log('Successfully inserted CO2 data:', data);
    return response.status(200).json({ success: true, saved_data: data });

  } catch (err) {
    console.error('Server error:', err);
    return response.status(500).json({ error: 'Internal Server Error' });
  }
}