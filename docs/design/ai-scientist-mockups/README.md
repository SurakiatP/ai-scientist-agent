# AI Scientist — UI mockups ชุดเดิม (เก็บเป็นประวัติ)

> ผู้ใช้เปลี่ยนทิศทางเป็นหน้าแชตสำหรับงานวิจัยและ Landing แบบไม่มีรูปแล้ว ชุดภาพนี้ **ไม่ใช่เป้าหมาย implementation ล่าสุด** ดู [ชุดทดลองธีมใหม่](../ai-scientist-chat-redesign/THEME-OPTIONS.md) และ [สเปก chat-first](../../superpowers/specs/2026-10-24-ai-scientist-chat-redesign.md)

ชุดภาพนี้สร้างด้วย `$impeccable` ร่วมกับ built-in `$imagegen` จาก [สเปกที่อนุมัติ](../../superpowers/specs/2026-10-24-ai-scientist-interface-design.md) เพื่อให้ Claude Code นำไปสร้าง UI จริง **ยังไม่มีการแก้โค้ดแอปในงานนี้** ภาพเป็นเป้าหมายของลำดับชั้น องค์ประกอบ และบรรยากาศ ไม่ใช่ไฟล์หน้าจอที่นำไปใช้แทน HTML หรือข้อความจริง

## ลำดับหน้า

| ลำดับ | ภาพ | หน้าที่และ component สำคัญ |
|---|---|---|
| 01 | [Landing — ไทย, Light](images/01-landing-light.png) | Brand/header, language + appearance control, hero headline, CTA “เริ่มต้นใช้งาน”, ภาพตัวอย่าง workspace, แถบเส้นทางงานวิจัย 5 ขั้น |
| 02 | [Research home — Light](images/02-research-home-light.png) | App shell/side navigation, ช่องเริ่มโจทย์, recent projects table, status badge, resume action, first-run guidance |
| 03 | [Question & plan — Light](images/03-question-plan-light.png) | Research question input, editable plan steps, progress states, search activity inspector, review notice, pause/edit actions |
| 04 | [Evidence — Light](images/04-evidence-light.png) | Search, source/year/status filters, sortable evidence rows, identifier verification badge, selected row inspector, source trail, report link action |
| 05 | [Analysis — Light](images/05-analysis-light.png) | Dataset card, tabs, preview table, chart, Python run steps, provenance panel, sample-data warning, run/download actions |
| 06 | [Report — Light](images/06-report-light.png) | Report section navigation, editor toolbar, linked evidence chips, analysis figure slot, pre-export checklist, PDF/DOCX controls |
| 07 | [Evidence — Dark](images/07-evidence-dark.png) | เนื้อหาและสถานะเดียวกับ 04; ใช้ทดสอบ contrast, semantic status และพื้นผิว dark ที่ออกแบบแยก |
| 08 | [Landing — Mobile](images/08-mobile-landing.png) | Hero เรียงแนวตั้ง, CTA เต็มความกว้าง, ภาพรองลงมา, เส้นทางงานวิจัยเป็นรายการแนวตั้ง |
| 09 | [Evidence — Mobile](images/09-mobile-evidence.png) | Search ก่อน, filter แบบยุบ/เลื่อน, evidence เป็นแถวสัมผัสได้, inspector เปลี่ยนเป็น detail sheet/route |
| 10 | [Settings — Light](images/10-settings-light.png) | ตัวเลือกภาษาไทย/English, Light/Dark/System, preview สี, ตัวอย่างส่วนเชื่อมต่อโมเดลที่ปิดบัง secret, saved feedback |
| 11 | [Landing — English](images/11-landing-english.png) | โครงหน้าเดียวกับ 01; ตรวจการจัดข้อความและความยาวภาษาอังกฤษ |

[ภาพถ่าย hero แยกส่วน](images/12-hero-photo.png) ใช้เป็น asset ได้: จอ laptop เว้นว่างไว้ให้วาง preview ที่สร้างด้วยโค้ดจริง ไม่ควรครอปเอาข้อความและ UI ที่ฝังอยู่ในภาพ 01/08/11 ไปใช้เป็นหน้าเว็บ ภาพ mockup และ prompt ทั้งหมดอยู่ใน [PROMPTS.md](PROMPTS.md)

## ระบบภาพที่ควรนำไปทำจริง

- **ฐาน:** `DESIGN.md` ของโปรเจกต์และแนว Evidence Field Notebook — paper `#F4F4F0`, sheet `#FDFDFA`, ink `#23252A`, fern action `#2E6B4F`, evidence teal `#0E7268`; สีอำพันใช้กับสิ่งที่ต้องทบทวน ไม่ใช้กับปุ่มทั่วไป
- **Dark:** พื้นถ่านอมเขียว, แผ่นงานแยกด้วยความสว่างและเส้นบาง; ไม่ invert ภาพ Light ตรง ๆ ค่าใน prompt ของภาพ 07 เป็นแนวทางเริ่มต้น ต้องตรวจ contrast จริงในเบราว์เซอร์
- **รูปแบบ:** ตัวอักษรไทยอ่านชัด, ความกว้างเนื้อหาเหมาะกับการอ่าน, ตารางแสดงข้อมูลก่อน decoration, เส้นคั่นมากกว่าเงาหนัก, มุมโค้งพอดี สีมีหน้าที่ ไม่ใช้กราฟ/แถบตัวเลขประดับ
- **Brand:** AI Scientist เป็นแบรนด์ของแอปเอง ห้ามใช้ตราหรืออ้างการรับรองอย่างเป็นทางการของ NECTEC
- **Wordmark:** ภาพที่สร้างแสดงรูปใบไม้/หนังสือหลายแบบเพราะเป็นภาพแนวคิด; ในโค้ดให้เลือกเครื่องหมายเดียวจากระบบแบรนด์ของโปรเจกต์และใช้ซ้ำทุกหน้า ไม่สร้างโลโก้ใหม่ตามแต่ละภาพ
- **System mode:** ค่าเลือกเก็บเป็น `system` แยกจากธีมที่แสดงผล; ติดตามการเปลี่ยน `prefers-color-scheme` ขณะเปิดแอป; ให้ผู้ใช้เลือก Light/Dark โดยตรงได้
- **Language:** แปล navigation, status, helper, error, empty state, filter, action และข้อความ landing ทั้งชุด ไม่ฝังข้อความจากรูปภาพ; ไทยและอังกฤษควรเปลี่ยนได้โดยไม่โหลดข้อมูลวิจัยใหม่

## การทำงานที่ภาพสื่อ

1. Landing CTA ไปหน้า Research home โดยไม่มี login ปลอม
2. Research home เริ่มโจทย์ใหม่หรือกลับเข้าโครงการเดิม
3. Question & plan ให้ตรวจ/แก้แผนก่อนและระหว่างการทำงานตามสถานะจริงของ Hermes
4. Evidence แยก `identifier verified` (เช่น DOI/PMID ตรวจพบ) ออกจาก `claim supported` (มีหลักฐานสนับสนุนข้อสรุป) อย่างชัดเจน; การตรวจ DOI ไม่ได้ยืนยันว่าบทความสนับสนุนคำกล่าว
5. Analysis แสดงข้อมูลเข้า รุ่นการรัน ขั้นตอน Python ตาราง/กราฟ และข้อผิดพลาดโดยผูกกับ run จริง
6. Report นำหลักฐานและผลวิเคราะห์ที่มี provenance มาเรียบเรียง ตรวจสิ่งที่ค้างก่อนส่งออก และใช้ PDF/DOCX เมื่อ backend รองรับจริง
7. Settings ควบคุมภาษาและรูปลักษณ์; การตั้งค่า provider/API ในภาพเป็นเพียงตัวอย่างของตำแหน่ง component ให้เชื่อมกับความสามารถและวิธีเก็บ secret จริงเท่านั้น

## สถานะที่ต้องออกแบบ ไม่ให้ภาพนิ่งกลบปัญหา

- ทุกหน้า: loading, empty, populated, error และ retry ที่บอกเหตุผลและการกระทำถัดไป
- Plan step: waiting, running, done, needs review, failed, paused; action ต้องสัมพันธ์กับสถานะ
- Evidence: unverified, identifier verified, review needed, source unavailable; ถ้าไม่มี DOI/PMID ให้แสดงว่าไม่มี ไม่สร้างค่าตัวอย่างที่ดูเป็นจริง
- Analysis: no file, upload/validation error, running, result ready, run failed; chart มีตารางหรือคำอธิบายเทียบเคียง
- Report: draft, unsaved, saved, missing evidence, export disabled/running/success/failure
- Theme/language: ค่าเลือกปัจจุบันเห็นชัดและใช้งานด้วย keyboard ได้; เคารพ reduced motion

## Responsive

- Desktop: sidebar ถาวร; แผงรายละเอียดหลักฐาน/การวิเคราะห์อยู่ขวาเมื่อมีพื้นที่
- Tablet: inspector ยุบเป็น drawer; ตารางเลื่อนแนวนอนเฉพาะตารางหรือแสดงคอลัมน์ตามลำดับความสำคัญ
- Mobile: menu แบบเปิดปิด, เนื้อหาคอลัมน์เดียว, search ก่อน filter, evidence เป็นรายการอ่านง่าย; แตะรายการเพื่อเปิด detail sheet/route เต็มจอ ไม่อัด inspector ข้างตาราง
- ภาพ 09 แสดง filter มากเกินพื้นที่จริงในแถวเดียว: ตอนลงโค้ดให้รวม filter รองไว้ใน sheet หรือแถวเลื่อนที่มี affordance ชัดเจน

## ข้อจำกัดของภาพที่ต้องแก้ตอนลงโค้ด

- ข้อความเล็กในภาพจาก image generation อาจสะกดผิดหรือมีรายละเอียดที่ไม่ตรงระบบ ให้ใช้ข้อความจากสเปกและ content จริง ไม่คัดลอกภาพเป็น source of truth
- รายชื่อบทความ แหล่งข้อมูล จำนวนเอกสาร ค่าในกราฟ วันเวลา และสถานะในภาพ **เป็นข้อมูลจำลองทั้งหมด**; ภาพ 03 แสดงชื่อฐานข้อมูลที่อาจต้องมีสิทธิ์ใช้งาน และภาพ 05 วาด timeline ที่ดูเสร็จพร้อมสถานะกำลังรัน ห้ามตีความเป็นการเชื่อมต่อหรือสถานะจริง
- ภาพ 01/08/11 แสดงเอกสารและ DOI ในจอ laptop เพื่อสื่อแนวคิดเท่านั้น ไม่ใช้เป็นหลักฐานหรือผลวิจัยจริง
- ภาพ 10 แสดง provider/API field เป็นตัวอย่าง component ไม่ยืนยันว่าระบบปัจจุบันรองรับ provider นั้นหรือบันทึก key ด้วยวิธีใด
- ภาพ 06 เป็นรายงานตัวอย่าง ไม่ใช่เนื้อหาสรุปผลวิจัยที่ตรวจสอบแล้ว

## เกณฑ์รับงาน UI สำหรับ Claude Code

- หน้า Landing เข้า workspace ได้ และชื่อแบรนด์/ภาพ/ภาษา/ธีมต่อเนื่องกัน
- มี layout และ component ตามหน้า 02–06, 10 พร้อมสถานะที่ใช้งานได้จริงตาม backend ที่มี; ส่วนที่ยังไม่มีข้อมูล/endpoint แสดง empty/coming state ที่ซื่อสัตย์ ไม่สร้างผลวิจัยปลอม
- Light/Dark/System และไทย/อังกฤษใช้ได้ทั่วทั้ง UI โดยไม่ฝังข้อความในภาพ
- Keyboard focus, contrast WCAG AA, touch target, 360px viewport และ reduced motion ผ่านการตรวจจริง
- Hermes เป็นขอบเขต backend ที่ผู้ใช้กำหนด; ตรวจ contract และความพร้อมก่อนเชื่อม ไม่ใช้ LangChain เป็นฐานสมมติ
- ภาพ mockup เป็นทิศทางภาพ; component ต้องสร้างเป็น HTML/CSS/React ที่ปรับขนาดและอ่านโดย screen reader ได้
