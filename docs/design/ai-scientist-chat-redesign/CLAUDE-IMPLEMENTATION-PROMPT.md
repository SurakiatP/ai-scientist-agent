# Prompt สำหรับ Claude Code — AI Scientist frontend

คัดลอกข้อความด้านล่างไปสั่ง Claude Code ใน repository `/Users/parksurakiat/ai-scientist-dem`.

---

คุณกำลังทำงานใน repository `/Users/parksurakiat/ai-scientist-dem` บน branch **`feature/research-search`** (ตรวจซ้ำด้วย `git branch --show-current` ก่อนเริ่ม). Branch นี้มีไฟล์ที่แก้ค้างอยู่และมีเอกสาร/ภาพที่ยัง untracked; เก็บงานเดิมทั้งหมดไว้ ห้าม reset, clean, checkout ทับ, stash โดยไม่วางแผน หรือทำให้ไฟล์เหล่านี้สูญหาย. ห้ามเปลี่ยน branch เป้าหมายโดยพลการ. อย่า push, merge หรือ publish โดยไม่ขออนุญาต. อ่าน `AGENTS.md` และ `frontend/AGENTS.md` รวมถึงกติกา RTK ของ repo ก่อนใช้ shell; ทุกคำสั่ง shell ให้ขึ้นต้นด้วย `rtk` ตาม `/Users/parksurakiat/.codex/RTK.md`.

## งานที่ต้องทำ

พัฒนา **frontend ที่ใช้งานได้จริง** ของ AI Scientist ให้ตรงกับชุดภาพที่ `docs/design/ai-scientist-chat-redesign/images/` ตามลำดับ 01–19 โดยใช้เอกสารต่อไปนี้เป็นข้อกำหนด:

1. `docs/design/ai-scientist-chat-redesign/README.md` — แผนที่ภาพและหน้าจอ
2. `docs/design/ai-scientist-chat-redesign/CLAUDE-HANDOFF.md` — พฤติกรรม component, theme, ภาษา และ guardrail
3. `docs/superpowers/specs/2026-10-24-ai-scientist-chat-redesign.md` — UX spec และสถานะ
4. `docs/design/ai-scientist-chat-redesign/THEME-OPTIONS.md` — โทน A ที่เลือก: Obsidian / Arctic Teal

ภาพเป็น visual reference ไม่ใช่ source of truth ของข้อมูลวิจัยหรือข้อความที่ AI gen ทุกตัว. ให้รักษาบุคลิกภาพที่ทันสมัย อ่านง่าย และเป็นงานออกแบบที่มนุษย์ตั้งใจทำ; หลีกเลี่ยงการใส่เอฟเฟกต์/การ์ด/gradient เกินจำเป็น. Landing ต้องไม่มีภาพถ่าย ภาพประกอบ หรือ screenshot. แบรนด์มีเพียง **AI Scientist** ไม่มีตรา NECTEC. กด “เริ่มต้นใช้งาน” แล้วเข้าหน้าแชตทันที.

## Workflow และบทบาท subagent ที่ต้องใช้

ใช้ skill **`superpowers:subagent-driven-development`** เป็นตัวควบคุมงาน และใช้ `superpowers:using-git-worktrees`, `superpowers:writing-plans`, `superpowers:requesting-code-review` และ `superpowers:finishing-a-development-branch` ตามขั้นตอนที่ skill กำหนด. ก่อนเริ่ม implementation ให้ทำแผนงานเป็น task ที่ตรวจรับได้และใช้ ledger ของ skill; ตรวจ branch, working tree, task overlap และข้อจำกัดก่อน dispatch. หากต้องสร้าง worktree ให้ยืนยันว่าภาพ/สเปกที่ยัง untracked เข้าถึงได้อย่างปลอดภัย และอย่าทำให้ checkout ปัจจุบันเสียงาน.

- **ผู้ลงมือเขียนโค้ดทุก task และทุก fix round:** Claude **Sonnet 5.5**, effort **medium**. ระบุ model/effort ในการ dispatch ทุกครั้ง. ให้ fresh implementer ตาม task เมื่อ skill กำหนด; implementer เขียนโค้ด ทดสอบ self-review และรายงานลงไฟล์ตาม contract ของ skill. ห้ามให้ implementer ตั้ง reviewer เอง
- **ผู้ตรวจทุก task, re-review และ whole-branch final review:** Claude **Opus 5.5**, effort **high**. ตรวจทั้งความตรงตามสเปกและคุณภาพโค้ดจาก diff package ตาม skill; implementer ต้องแก้ finding แล้วให้ reviewer ตรวจซ้ำ. ใช้ Opus 5.5 high ตรวจรวมอีกครั้งเมื่อทุก task เสร็จ
- หาก fix loop ของ skill ถึงจุดที่แนะนำให้เปลี่ยนเป็น implementer รุ่นที่แรงกว่า ให้ยึดคำสั่งเจ้าของงานที่กำหนดว่า **Sonnet 5.5 medium เขียนโค้ดทั้งหมด**: บันทึก ruling, เปลี่ยนเป็น Sonnet 5.5 medium คนใหม่พร้อมบริบท/ขอบเขตย่อยที่ชัดขึ้น และให้ Opus 5.5 high ตรวจต่อ; อย่าให้ Opus ลงมือเขียนโค้ด
- หากชื่อรุ่น/effort นี้ไม่พร้อมใน environment ให้แจ้งข้อจำกัดชัดเจนก่อนเปลี่ยนรุ่น อย่าสลับรุ่นเงียบ ๆ
- ทำงานต่อเนื่องตาม plan ไม่ถาม “ให้ทำต่อไหม” ระหว่าง task. ตัดสินใจ implementation ที่ย้อนกลับได้จากสเปกและบันทึก ruling ตาม skill. หยุดเฉพาะกรณีที่ skill ระบุว่าต้องหยุด

## สำรวจระบบจริงก่อนเขียน

Frontend ปัจจุบันเป็น Next.js 16 App Router + React 19 + MUI. อ่าน `frontend/AGENTS.md` และคู่มือ Next.js ที่ติดตั้งใน `frontend/node_modules/next/dist/docs/` ก่อนแตะโค้ด. สำรวจหน้า `/`, `/ask`, `/saved`, components, theme, tests, state/history และ API config ปัจจุบันก่อนทำแผน. Backend มี FastAPI/Hermes, research-only guardrail, `POST /v1/async/ask` แบบ SSE และ `/v1/health`; ประวัติคำตอบปัจจุบันอยู่ใน browser. ตรวจ event schema, ข้อจำกัด และ error states จริงก่อนผูก UI. **ใช้ Hermes ที่มีอยู่ ห้ามเพิ่ม LangChain.** ห้ามคาดเดา API สำหรับ project/session/plan/artifact/source ที่ยังไม่มี. งานหลักคือ frontend; หากฟีเจอร์ใดต้องเพิ่ม backend contract ที่ยังไม่มี ให้แยก gap ชัดเจนและทำ UI ที่บอกสถานะตรงความจริง แทนการแสดงการทำงานปลอม

## ขอบเขตหน้าจอและพฤติกรรม

1. **Landing** ทั้ง Dark/Light และ responsive: typography-led hero, value proposition, วิธีทำงาน, CTA เข้าหน้าแชต, language/theme controls; ไม่มีภาพถ่าย/ภาพประกอบ/screenshot
2. **Chat home หลัง CTA:** sidebar สร้างแชต, โปรเจกต์, เซสชันล่าสุด, ค้น/สลับเซสชัน; project switcher; คำถามเริ่มต้น, composer แนบเอกสารและส่ง, เลือกโหมดตามความสามารถที่ระบบรองรับ. Empty state ต้องตรงข้อมูลจริง
3. **Conversation:** user/Hermes messages, streaming progress จาก SSE จริง, Markdown, stop/cancel/retry เมื่อ backend รองรับ, error/reconnect states, ถามต่อในเซสชันเดิม, การแสดง citation และสถานะการตรวจสอบแหล่งอ้างอิง
4. **Deep Research:** แผน ขั้นตอน ความคืบหน้า และ source inspector ตามภาพ 03/07/17 แต่ผูกกับข้อมูลจริง. ถ้า backend ยังไม่มี editable plan หรือ stage events ตามภาพ ให้แสดงเฉพาะสิ่งที่ทำได้จริง และระบุ gap สำหรับงานต่อไป; ห้ามสร้าง fake progress, fake source, fake completed steps
5. **Artifacts/report:** ออกแบบ container/viewer ตามภาพ 08/09 และแสดงเฉพาะผลที่ backend ส่งจริง; export ต้องทำงานจริงหรือเป็น disabled state ที่อธิบายได้. ห้ามแสดงกราฟ/ตัวเลข/DOI/PMID จำลองเป็นผลลัพธ์จริง
6. **Guardrail:** backend/Hermes เป็นตัวตัดสิน research-only; frontend แสดงคำปฏิเสธสุภาพและทางกลับสู่โจทย์วิจัยเมื่อผู้ใช้ถามนอกเรื่องหรือด่า. อย่าทำ client-only guardrail เป็นคำตอบแทน backend และอย่าให้ UI ตอบคำถามนอกเรื่อง
7. **Theme:** Light, Dark, System แบบ persistent; System ติดตาม `prefers-color-scheme` และเปลี่ยนตาม OS; ไม่มี flash ผิดธีม. ใช้ semantic color tokens และตรวจ contrast/focus อย่างน้อย WCAG AA. ภาพ 11–14, 16, 18 และ 19 เป็นหลักฐานสำหรับ Light mode
8. **ภาษา:** ไทย/อังกฤษครบทุกหน้ารวม loading/error/guardrail/settings; สลับภาษาโดยรักษาเซสชันและ theme. ใช้ภาพ 19 ช่วยเรื่อง English copy แต่ตรวจข้อความเอง
9. **Responsive:** desktop/tablet/mobile; sidebar เป็น drawer บนมือถือ, chat เป็นคอลัมน์เดียว, composer ใช้ง่าย, inspector/plan เป็น panel หรือ sheet. หลีกเลี่ยง horizontal overflow

ชื่อแหล่งข้อมูลอย่าง Scopus/Web of Science ในภาพเป็นตัวอย่าง UI เท่านั้น ไม่ใช่การยืนยันสิทธิ์หรือ integration. ชื่อ paper, citation, DOI/PMID, จำนวนเอกสาร, กราฟ และตัวเลขในภาพเป็นข้อมูลจำลอง. UI จริงแสดงเฉพาะ source ที่ backend เข้าถึงได้และข้อมูลที่ตรวจสอบแล้ว

## Verification และการส่งงาน

- หลังแต่ละ task ให้ Sonnet 5.5 medium รัน test ที่เกี่ยวข้องและบันทึกผล; ให้ Opus 5.5 high ทำ task review จาก diff แล้ววนแก้ตาม skill
- เมื่อรวมงาน ให้รัน frontend lint, tests, build และ backend tests ที่เกี่ยวกับ contract/guardrail หากแตะ contract นั้น. ตรวจการทำงานกับ backend ที่รันจริงเมื่อ environment พร้อม; อย่าใส่ API key ใน log หรือรายงาน
- ใช้ **`/claude-in-chrome`** เปิดเว็บแอปที่รันอยู่เพื่อตรวจด้วยสายตาและทดลอง flow จริง: Landing→Chat, โปรเจกต์/เซสชัน, คำถามวิจัยและ citation, คำถามนอกเรื่อง, Light/Dark/System, ไทย/English, desktop/mobile. ถ่าย screenshot เทียบภาพอ้างอิงและแก้ปัญหา layout/interaction ที่พบ. ถ้า `/claude-in-chrome` ใช้ไม่ได้ ให้รายงานว่าตรวจส่วนใดไม่ได้และใช้ browser tool ที่มีแทนโดยไม่อ้างว่าตรวจสำเร็จ
- ให้ Opus 5.5 high ทำ whole-branch review หลังการตรวจ UI. รายงานสุดท้ายต้องมีสิ่งที่สร้าง, test/build/browser evidence, สิ่งที่ backend ยังไม่รองรับ, รายการ ruling ของ skill, commit/branch ปัจจุบัน และไฟล์สำคัญที่เปลี่ยน. ห้าม push/merge เอง

เริ่มจากตรวจสถานะ branch และ working tree แล้วทำ plan ก่อน dispatch implementer คนแรก
