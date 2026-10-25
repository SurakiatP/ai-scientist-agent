# ข้อความส่งต่อให้ Claude Code

> **เอกสารนี้ถูกแทนที่แล้ว** หลังผู้ใช้เปลี่ยนทิศทางเป็น chat-first โปรดใช้ [สเปกใหม่](../../superpowers/specs/2026-10-24-ai-scientist-chat-redesign.md) และชุดภาพใหม่เมื่อเลือกโทนสีแล้ว อย่าส่งข้อความด้านล่างเป็นคำสั่ง implementation ล่าสุด

> นำข้อความด้านล่างไปส่งให้ Claude Code พร้อมชี้ไปที่โฟลเดอร์นี้ใน repository

โปรดพัฒนา UI ของเว็บแอป AI Scientist ตามเอกสารและภาพใน `docs/design/ai-scientist-mockups/README.md` และสเปก `docs/superpowers/specs/2026-10-24-ai-scientist-interface-design.md` โดยใช้ภาพ 01–11 เป็นเป้าหมายเชิงภาพ และใช้ `images/12-hero-photo.png` เป็น asset สำหรับ landing page ได้ ภาพเหล่านี้สร้างด้วย AI และเป็น mockup ไม่ใช่ข้อมูลจริงหรือข้อความที่ต้องคัดลอกทั้งหมด

สิ่งที่ต้องทำ:

1. สำรวจโค้ด Next.js/React, `PRODUCT.md`, `DESIGN.md`, route, component, theme, string และ API ที่มีอยู่ก่อนเริ่ม อย่าทับหรือย้อนการแก้ไขที่มีอยู่ใน working tree
2. ทำ Landing page ภาษาไทยและอังกฤษพร้อมปุ่ม “เริ่มต้นใช้งาน / Get started” ไปยัง Research home
3. ทำ app shell และหน้า Research home, Question & plan, Evidence, Analysis, Report, Settings ให้มีลำดับชั้นและ component ตาม README; ใช้ reusable component และ semantic design tokens
4. ทำ Light, Dark, System mode และการสลับไทย/อังกฤษทั่วทุกหน้า รวม empty/loading/error/success/review state ที่จำเป็น
5. ใช้ Hermes เป็นทิศทาง backend ตามการตัดสินใจของเจ้าของโปรเจกต์ ตรวจ contract ที่มีจริงก่อนเชื่อม API อย่าเพิ่ม LangChain หรือสมมติว่า backend รองรับทุกความสามารถใน TOR แล้ว
6. เชื่อมการกระทำกับ backend/ข้อมูลจริงเฉพาะที่มีอยู่; ฟีเจอร์ที่ยังไม่พร้อมต้องแสดงสถานะหรือขอบเขตที่ซื่อสัตย์ ไม่สร้าง citation, DOI, PMID, ผลการวิเคราะห์ หรือสถานะตรวจสอบปลอมเพื่อให้หน้าดูเต็ม
7. ทำ responsive ที่ 360px ขึ้นไป, keyboard navigation, visible focus, WCAG AA contrast และ reduced motion; ตรวจในเบราว์เซอร์ทั้ง Desktop/Mobile และ Light/Dark

ข้อควรจำ: ภาพหน้า 03 มีชื่อแหล่งข้อมูลที่อาจไม่มีสิทธิ์ใช้งาน ภาพ 05 มีข้อมูล/กราฟจำลองและ timeline ไม่สอดคล้องเชิงตรรกะ ภาพ 10 มีตัวอย่าง provider/API setting สิ่งเหล่านี้เป็นแนว UI เท่านั้น ต้องผูกกับความสามารถจริงหรือแสดงเป็นตัวอย่างอย่างชัดเจน ห้ามฝัง UI screenshot เป็นหน้าเว็บ; สร้าง controls และข้อความด้วยโค้ดที่เข้าถึงได้

ผลลัพธ์ที่ต้องส่ง: โค้ด UI ที่ทำงานได้, รายการหน้าและ component ที่ทำ, รายการ endpoint/ฟีเจอร์ที่เชื่อมจริงกับที่ยังรอ Hermes, และหลักฐานตรวจ Desktop/Mobile + Light/Dark + ไทย/อังกฤษ
