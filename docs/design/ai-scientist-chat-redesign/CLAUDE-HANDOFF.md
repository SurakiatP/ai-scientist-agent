# Handoff สำหรับ Claude Code: AI Scientist chat-first UI

## เป้าหมาย

ใช้ภาพและสเปกในโฟลเดอร์นี้เป็นทิศทางสร้าง UI ที่ใช้งานได้จริงสำหรับ AI Scientist. ผู้ใช้หลักคือนักวิจัย NECTEC แต่ตัวผลิตภัณฑ์เป็นแบรนด์ AI Scientist แยกต่างหาก **ไม่มีตรา NECTEC**. Landing เป็นหน้าแรกสาธารณะ และปุ่ม **เริ่มต้นใช้งาน** เข้าสู่หน้าแชตทันที. ใช้ Hermes เป็น backend/agent ตามสถาปัตยกรรมโปรเจกต์ ไม่เปลี่ยนเป็น LangChain

## ทางเดินหลัก

1. Landing → เริ่มต้นใช้งาน → แชตใหม่ในโปรเจกต์เริ่มต้น/โปรเจกต์ส่วนตัว.
2. ผู้ใช้ถามเรื่องงานวิจัยหรือแนบเอกสาร → เลือกโหมดสนทนาหรือ Deep Research → ส่งข้อความ.
3. ใน Deep Research แสดงแผนที่อ่านและแก้ก่อนเริ่มได้; หลังเริ่มแสดงความคืบหน้ารายขั้น, หลักฐานที่พบ, สถานะรอ/กำลังทำ/เสร็จ/ผิดพลาด และวิธียกเลิกหรือ retry.
4. ตอบในเซสชันเดิมด้วยข้อความอ่านง่าย, citation ที่เปิด source inspector ได้, ผลวิเคราะห์และรายงานเป็น artifacts. ผู้ใช้ถามต่อและแก้โจทย์ได้โดยไม่ต้องเริ่ม flow ใหม่.
5. Sidebar ใช้สร้าง/สลับโปรเจกต์และเซสชัน; เซสชันแสดงชื่อ, เวลาอัปเดต, โปรเจกต์ และสถานะ. Empty state ต้องตรงกับข้อมูลจริง.

## Component และ behavior ที่ต้องสร้าง

| Component | พฤติกรรม |
|---|---|
| Global header / sidebar | Branding, new chat, รายการโปรเจกต์, session list, search, settings; ยุบได้บนจอเล็ก |
| Project switcher | เลือก/สร้างโปรเจกต์; ไม่เปลี่ยนชื่อโปรเจกต์ตามข้อความในแชต |
| Chat transcript | แยกข้อความ user/Hermes, timestamp, Markdown, streaming/loading, copy, feedback และ follow-up |
| Composer | พิมพ์หลายบรรทัด, แนบไฟล์, ส่ง, หยุด, mode selector, disabled/upload/error states, keyboard behavior |
| Research plan | ขั้นตอนที่ Hermes เสนอ, แก้และยืนยันก่อนรันเมื่อ workflow ต้องการ, สถานะรายขั้นและ progress ที่อ่านได้ |
| Source inspector | คลิก citation แล้วเปิด metadata และข้อความอ้างอิง; แยก source ที่ตรวจสอบได้จาก claim ที่ยังไม่มีหลักฐาน |
| Artifacts | วิเคราะห์/ตาราง/กราฟ/รายงานผูกกับ session/project และ provenance; preview, download/export เมื่อ backend รองรับจริง |
| Settings | ภาษา ไทย/English และธีม Light/Dark/System; ค่าที่เลือกต้องอยู่ต่อหลัง refresh |

## Research-only guardrail

Guardrail ต้องทำที่ Hermes/backend ด้วย ไม่ใช้เพียงการซ่อนปุ่มใน UI. อนุญาตโจทย์วิจัย การวางแผน ค้นคว้า วิเคราะห์ สังเคราะห์ และถามต่อจากหลักฐาน. สำหรับข้อความนอกเรื่อง เช่น “กินข้าวยัง?” หรือคำด่า ให้ตอบสั้น สุภาพ ว่า AI Scientist ช่วยเรื่องงานวิจัย และเสนอทางกลับเข้าโจทย์ **อย่าตอบคำถามนอกเรื่องหรือโต้เถียง**. ต้องจัดการข้อความกำกวมด้วยการถามกลับสั้น ๆ; ข้อความที่มีเนื้อหาวิจัยจริงแม้ภาษาหยาบควรพิจารณาเจตนาและตอบอย่างมืออาชีพ. บันทึกเหตุผลของการปฏิเสธในระบบตามข้อกำหนด privacy โดยไม่เปิดเผย prompt ภายใน

## ธีม ภาษา และ responsive

- ใช้โทน Obsidian / Arctic Teal ใน Dark: พื้นน้ำเงินดำ ตัวอักษรขาวนวล และ teal เฉพาะ action/สถานะสำคัญ. Light: พื้นขาวนวล ตัวอักษรน้ำเงินดำ teal เข้มเพื่อ contrast. สีต้องเป็น semantic tokens (surface, text, border, accent, state) ไม่ hardcode ตามตำแหน่งแต่ละจุด
- System mode ติดตาม `prefers-color-scheme` และเปลี่ยนตาม OS ขณะใช้งาน; explicit Light/Dark มีลำดับความสำคัญเหนือค่า OS. ต้องเลี่ยง theme flash ตอนเริ่มหน้า
- ภาษาไทยและอังกฤษต้องครอบคลุม Landing, navigation, empty states, settings, loading/error, guardrail, citation UI และ artifacts. สลับภาษาโดยรักษา session และ theme เดิม; รองรับการขยายข้อความไทย/อังกฤษ
- Mobile ใช้ sidebar เป็น drawer, transcript แบบคอลัมน์เดียว, composer เข้าถึงง่าย, plan และ inspector เป็น panel/sheet. ไม่บังคับ horizontal scroll
- ตรวจ contrast อย่างน้อย WCAG AA สำหรับข้อความและ interactive controls, focus visible, keyboard navigation, target size, reduced motion

## ขอบเขตการตีความภาพ

ภาพทั้งหมดเป็น mockup ที่สร้างด้วย AI เพื่อแสดง layout, component hierarchy และบุคลิกภาพ. **อย่าคัดลอกข้อความผิด สถานะไม่สมจริง หรือข้อมูลตัวอย่างโดยไม่ตรวจ**. ชื่อ paper, citation, DOI/PMID, จำนวนแหล่งข้อมูล, chart และผลวิเคราะห์เป็น placeholder. ภาพ 03/17 ที่แสดง Scopus และ Web of Science **ไม่ได้แปลว่ามีสิทธิ์หรือเชื่อมต่อแล้ว**; UI จริงควรแสดงเฉพาะ source ที่ backend เปิดใช้จริงและสิทธิ์อนุญาต. ห้ามสร้างข้อมูลวิจัยหรือ citation ปลอมใน production; หากไม่พบหลักฐานให้บอกข้อจำกัดชัดเจน

## สิ่งที่ส่งให้ตรวจรับ UI

- Landing ไม่มีภาพถ่าย ภาพประกอบ หรือ screenshot และ CTA พาเข้า chat
- New chat, existing session, project switch, Deep Research running, answer/citations, source inspector, off-topic, failure/retry, settings ทำงานได้ตามสถานะจริง
- Light/Dark/System และ ไทย/English ใช้ได้ทั้ง desktop/mobile และจำค่าที่ตั้งไว้
- Hermes research-only guardrail ถูกบังคับที่ backend และ UI แสดงคำตอบปฏิเสธสุภาพ
- ไม่มีตรา NECTEC หรือแหล่งข้อมูลจำลองที่ถูกนำเสนอว่าเชื่อมต่อแล้ว

## Prompt พร้อมส่งต่อ

> Implement the AI Scientist chat-first frontend in this repository using `docs/design/ai-scientist-chat-redesign/README.md`, `CLAUDE-HANDOFF.md`, the UX spec, and numbered mockups as the design contract. Landing must be image-free and lead directly to chat. Build real project/session navigation, interactive chat with Hermes integration according to existing backend contracts, Deep Research states, evidence inspection, and research-only guardrail behavior. Support Thai/English and persistent Light/Dark/System themes, including responsive mobile views. Treat all mockup papers, citations, counts, charts, and source integrations as illustrative. First inspect the repository's actual contracts, then implement in reviewable slices and verify each flow. Do not add LangChain or NECTEC branding.
