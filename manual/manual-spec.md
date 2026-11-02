---
system: AI Scientist (ผู้ช่วยค้นคว้างานวิจัย)
version: 0.1
updated: 2026-11-02
sources: discovery.json (nextjs, projectRoot ../frontend), PRODUCT.md, DESIGN.md, README.md, docs/api.md, frontend/src/lib/strings.ts, backend/src/scientist/*
---

# สเปกคู่มือ: AI Scientist

สถานะ: ร่างสำหรับเจ้าของงานตรวจ เขียนจากโค้ดและแอปที่รันจริงเมื่อ 2026-11-02 ทุกข้อมีที่มา ข้อที่ยังไม่รู้เป็น Q-xx
เส้นทางไฟล์ในสเปกนับจากรากของ repo (`frontend/...`, `backend/...`) ส่วน `sources:` ในหน้าคู่มือนับจาก `frontend/` ตาม `projectRoot` ใน `manual/manual.config.yaml`

## 1. วัตถุประสงค์และผู้อ่าน (purpose and audience)
- คู่มือเล่มเดียว `user-guide` ช่วยให้ผู้ใช้ตั้งคำถามวิจัย อ่านคำตอบพร้อมแหล่งอ้างอิง ถามจากเอกสารและไฟล์ข้อมูลของตัวเอง และส่งออกเป็นรายงาน (ที่มา: `PRODUCT.md` หัวข้อ Product Purpose, `README.md`)
- ผู้อ่านหลักคือนักวิจัยที่ทำงานทั้งไทยและอังกฤษ (`PRODUCT.md` หัวข้อ Users: นักวิจัย NECTEC) นักศึกษาและผู้ที่ค้นงานวิชาการก็ใช้ได้ (`frontend/src/lib/strings.ts` `landing.th.badge`) ผู้อ่านรู้จักแอปแชตทั่วไป ไม่ต้องรู้ว่าระบบทำงานข้างหลังอย่างไร เปิดคู่มือระหว่างใช้แอป
- ไม่มีผู้ดูแลระบบในแอป จึงไม่มีเล่มผู้ดูแล การติดตั้งและตั้งค่าเซิร์ฟเวอร์อยู่ใน `docs/deploy.md` ซึ่งนอกขอบเขตเล่มนี้

## 2. ภาพรวมระบบ (system overview)
- เว็บแอปให้ถามคำถามวิจัยเป็นภาษาไทยหรืออังกฤษ ระบบวางแผนคำค้น ค้นจากแหล่งวิชาการ เรียบเรียงคำตอบจากงานที่ค้นเจอ และตรวจว่า DOI, PMID หรือ arXiv ID ของแต่ละอ้างอิงมีอยู่จริง (`README.md` หัวข้อ Architecture, `frontend/src/lib/strings.ts` `landing.th.steps`)
- ส่วนหลักที่ผู้ใช้เห็น: หน้าแรกแนะนำ (`/`) พื้นที่แชต (`/chat`) ไฟล์ของฉัน (`/files`) ถังขยะ (`/trash`) สถิติการใช้งาน (`/usage`) หน้าให้ข้อมูล (`/how-it-works`, `/faq`, `/features/[slug]`) และหน้าต่างการตั้งค่า (`frontend/src/app/*/page.tsx`, `frontend/src/components/settings/SettingsDialog.tsx`)
- ไม่มีการเข้าสู่ระบบ ทุกคนที่เข้าถึงเซิร์ฟเวอร์เดียวกันเห็นและแก้ข้อมูลชุดเดียวกัน เมื่อเซิร์ฟเวอร์มีฐานข้อมูลร่วม (`strings.th.dataNoteShared`, seen: ตัวบอกสถานะ "ออนไลน์ · ฐานข้อมูลร่วม", 2026-11-02)
- ระบบตอบเฉพาะคำถามวิจัยทางวิทยาศาสตร์ นอกขอบเขตจะปฏิเสธ (`PRODUCT.md` Capabilities & Constraints, `backend/src/scientist/guardrail.py`)
- ผู้ใช้หลักตาม TOR มีความสามารถที่ยังไม่ครบในโค้ดปัจจุบัน คู่มือเขียนเฉพาะสิ่งที่ใช้ได้จริง (`PRODUCT.md` Operating Context)

## 3. ผู้ใช้และบทบาท (actors and roles)
| บทบาท | ทำอะไรได้ | สิทธิ์ | หลักฐาน |
|---|---|---|---|
| ผู้ใช้ (ทุกคน) | ทุกฟังก์ชันของแอป | ไม่มีสิทธิ์แยกระดับ ไม่มีการเข้าสู่ระบบ | `README.md` หัวข้อ Privacy, `strings.th.dataNoteShared`, discovery.json: 0 roles, 0 permissions |
| ผู้เรียกใช้ผ่าน API/MCP | เรียกใช้ด้วย API key | key ต่อผู้ใช้ | `docs/api.md` (นอกขอบเขต ดู §13) |

## 4. รายการความสามารถ (feature inventory)
| # | ความสามารถ | ทำอะไร | หน้าจอ | หลักฐาน | หน้าคู่มือ |
|---|---|---|---|---|---|
| F1 | หน้าแรกและปุ่มเริ่มต้นใช้งาน | แนะนำระบบ พาเข้าแชต | `/` | `frontend/src/app/page.tsx`, `strings.landing` | getting-started |
| F2 | ถามคำถามวิจัย 3 โหมด | ค้นหาเชิงลึก, ค้นหาทั่วไป, ตอบคำถาม (จากผลในเซสชัน) | `/chat` | `frontend/src/components/chat/Composer.tsx`, `frontend/src/lib/sse.ts:27` (AskMode) | ask-a-question |
| F3 | เลือกสาขาการวิจัย | 6 สาขาและ "ทุกสาขา" | `/chat` | `frontend/src/lib/packs.ts` | ask-a-question |
| F4 | ตรวจ/แก้แผนก่อนค้น | แก้คำค้น (ภาษาอังกฤษ สูงสุด 5) เพิ่มคำสั่ง แล้วกดเริ่มค้นหา | `/chat` | `frontend/src/components/research/PlanCard.tsx` (MAX_PLAN=5, THAI), `strings.reviewPlan` | review-plan, plan-setting |
| F5 | ดูความคืบหน้า หยุดงาน คิว | แสดงขั้นตอน คำค้นที่สรุปแล้ว ลำดับคิว ปุ่มหยุด | `/chat` | `frontend/src/components/research/ProgressPanel.tsx`, `strings.queueRow`, `strings.stop` | ask-a-question, faq |
| F6 | คำตอบพร้อมเลขอ้างอิง และแผงแหล่งข้อมูล | คลิกชื่ออ้างอิงเปิดรายละเอียด ดูข้อความที่ใช้อ้าง และผลตรวจเลข | `/chat` | `frontend/src/components/AnswerView.tsx`, `frontend/src/components/research/SourceInspector.tsx`, `strings.supSupported` | read-sources |
| F7 | คัดลอกคำตอบ ส่งออก BibTeX, RIS, ไฟล์ที่มา | ปุ่มใต้คำตอบ | `/chat` | `frontend/src/components/chat/AgentMessage.tsx:183-200`, `frontend/src/lib/provenance.ts` | export-references |
| F8 | ถามจากเอกสาร PDF (1-5 ไฟล์) และแผนทำซ้ำ paper | ตอบจากเอกสารเท่านั้น ระบุหน้าและข้อความ | `/chat` | `Composer.tsx` (MAX_DOCS=5), `strings.docsMax`, `backend/src/scientist/docs_answer.py` | ask-documents |
| F9 | วิเคราะห์ไฟล์ข้อมูล | รัน Python ในแซนด์บ็อกซ์ แสดงตาราง แผนภาพ สรุป โค้ด | `/chat` | `frontend/src/components/research/AnalysisArtifact.tsx`, `backend/src/scientist/routes_analyze.py`, `landing.th.capData` | analyze-data |
| F10 | ไฟล์ของฉัน | อัปโหลด ค้นหา ดูตัวอย่าง ดาวน์โหลด เปลี่ยนชื่อ ย้าย ลบ | `/files` | `frontend/src/components/files/FilesPage.tsx` | manage-files |
| F11 | ร่างรายงานและเอกสาร | เปิดรายงาน สารบัญ แชร์/ส่งออก PDF/Word/Markdown/คัดลอก แก้ไขและสร้างเอกสาร | `/chat` | `frontend/src/components/research/ReportPanel.tsx`, `ReportForm.tsx` | create-report |
| F12 | ประเภทบทความ ผู้เขียน คำสำคัญ บทคัดย่อ ข้อความปิดท้าย | เติมโครงเรื่องและส่วนหน้า/ท้ายเอกสาร | `/chat` | `frontend/src/lib/paperOutline.ts`, `frontend/src/lib/exportReport.ts` (LIM, STATEMENT_KINDS) | report-details |
| F13 | ส่งออก LaTeX | 4 แบบ (article, IEEE, Elsevier, Springer) ดาวน์โหลด .tex | `/chat` | `exportReport.ts:18`, `strings.fTexNote`, `backend/src/scientist/report_latex.py` | export-latex |
| F14 | ประวัติแชต ค้นหา โปรเจกต์ | ค้นชื่อแชต สร้าง/ย้าย/เปลี่ยนชื่อ/ลบ | แถบด้านซ้าย | `frontend/src/components/shell/*` | find-chats, organize-chats, delete-chat |
| F15 | ถังขยะ | เก็บ 7 วัน กู้คืน ลบถาวร ล้างที่หมดอายุ | `/trash` | `frontend/src/components/trash/TrashPage.tsx`, `strings.trashNote` | trash |
| F16 | การตั้งค่า | ภาษา ธีม ตรวจแผนก่อนค้น ลบแชตทั้งหมด นำเข้าข้อมูลเดิม | หน้าต่างการตั้งค่า | `SettingsDialog.tsx`, `ImportOld.tsx` | language-theme, plan-setting, data-and-privacy |
| F17 | สถิติการใช้งาน | จำนวนครั้ง เวลา โทเคน ค่าใช้จ่ายเฉลี่ยแยกโหมด 7/30 วัน | `/usage` | `frontend/src/components/usage/UsagePage.tsx`, `backend/src/scientist/usage.py` | usage |
| F18 | หน้าให้ข้อมูล | วิธีทำงาน คำถามที่พบบ่อย รายละเอียดฟีเจอร์ | `/how-it-works`, `/faq`, `/features/[slug]` | `strings.sitePages` | about |
| F19 | ขอบเขตและการปฏิเสธ | ปฏิเสธนอกขอบเขต คำสั่งเปลี่ยนกฎ เขียนงานแทน วินิจฉัยโรค | `/chat` | `guardrail.py`, `strings.refused*` | limits-and-safety |

## 5. ขั้นตอนการทำงานตั้งแต่ต้นจนจบ (end-to-end workflows)
### 5.1 จากคำถามถึงรายงาน
- ผู้เกี่ยวข้อง: ผู้ใช้
- เริ่มเมื่อ: กด "เริ่มต้นใช้งาน" จบเมื่อ: บันทึกเอกสารไว้ใน "ไฟล์ของฉัน" หรือดาวน์โหลด .tex
- ขั้นตอน: ถาม → (ตรวจแผน) → ค้นหา → เรียบเรียง → ตรวจอ้างอิง → อ่านคำตอบและแหล่งข้อมูล → ส่งออกอ้างอิง/สร้างรายงาน (`README.md` Architecture, `strings.th.step1Title`..`step4Title`)
- สถานะของงาน: `running` → `awaiting_plan` → `done` | `refused` | `error` | `stopped` | `interrupted` (`frontend/src/lib/chat.ts:56`) ลำดับคิว `queued` → `running` (`frontend/src/lib/runs.ts:26`)
- สถานะของเลขอ้างอิง: พบเลขอ้างอิงนี้จริง / ยังยืนยันไม่ได้ว่ามีงานนี้จริง / ตรวจสอบไม่ได้ / ไม่มีเลขอ้างอิงให้ตรวจ (`strings.th.verified`, `unconfirmedText`, `unknown`, `noIdText`)
- ผลตรวจข้อความ: บทคัดย่อสนับสนุน / สนับสนุนบางส่วน / ไม่สนับสนุน / ไม่พบข้อความอ้างอิง (`frontend/src/lib/refs.ts:54` SUPPORT)

### 5.2 ถามจากเอกสาร
- แนบ PDF 1-5 ไฟล์ → ระบบสลับเป็นโหมด "จากเอกสาร" → ถาม → คำตอบมีเลข [n] และหน้า/ข้อความจากเอกสาร (`Composer.tsx`, `strings.docsModeNote`, `docPage`, `docQuote`) อ่านได้สูงสุด 300 หน้าแรก (`strings.docsTruncated`)

### 5.3 วิเคราะห์ไฟล์ข้อมูล
- แนบหรือเลือก "วิเคราะห์" จาก "ไฟล์ของฉัน" (CSV, XLSX, Parquet, JSON) → ถาม → ขั้นตอน: ตรวจโครงสร้างไฟล์, เขียนสคริปต์วิเคราะห์, รันการวิเคราะห์, ซ่อมสคริปต์, บันทึกผลลัพธ์ (`frontend/src/lib/sse.ts:55`) → แท็บ ภาพรวม ตารางข้อมูล แผนภาพ สรุปผล โค้ดและบันทึกการรัน (`AnalysisArtifact.tsx:19`)

### 5.4 ลบและกู้คืน
- ลบแชต/โปรเจกต์/ไฟล์ → ถังขยะ 7 วัน → กู้คืน หรือลบถาวร (`strings.trashNote`, `deleteFileBodyTrash`) ใช้ได้เมื่อเชื่อมฐานข้อมูลร่วมเท่านั้น (`strings.trashOff`)

## 6. กฎทางธุรกิจและการตรวจสอบข้อมูล (business rules and validations)
| กฎ | ใช้ที่ไหน | หลักฐาน |
|---|---|---|
| คำถามยาวไม่เกิน 2000 ตัวอักษร | ช่องคำถาม | `frontend/src/lib/strings.ts:1601` MAX_QUESTION, `strings.th.tooLong` |
| เลือกโหมด "ตอบคำถาม" ได้เมื่อเซสชันนั้นมีคำตอบแล้ว | ปุ่มโหมด | `Composer.tsx` (hasMemory), `strings.modeChatDisabled` |
| คำค้นในแผนต้องเป็นภาษาอังกฤษและไม่ว่าง สูงสุด 5 คำ | แผนการวิจัย | `PlanCard.tsx` (THAI, MAX_PLAN), `strings.planTermEnglish`, `planTermRequired` |
| ค้นหาเชิงลึกรอให้ตรวจแผน ปิดได้ในการตั้งค่า | การตั้งค่า | `frontend/src/lib/prefs.ts` (reviewPlan), `strings.reviewPlanNote` |
| แนบ PDF ได้ 1-5 ไฟล์ หรือไฟล์ข้อมูล 1 ไฟล์ ไม่ปนกัน | ช่องคำถาม | `Composer.tsx` (MAX_DOCS), `strings.docsMax`, `attachOneKind` |
| ไฟล์ข้อมูลที่วิเคราะห์ได้: csv, xlsx, parquet, json | ไฟล์ของฉัน | `frontend/src/lib/files.ts:12` |
| ชื่อไฟล์ใหม่ไม่ว่าง ยาวไม่เกิน 120 ตัวอักษร ไม่มีอักขระควบคุม ต้องคงนามสกุล | เปลี่ยนชื่อไฟล์ | `strings.nameErr*`, `files.ts` NAME_MAX |
| โปรเจกต์มีได้ไม่เกิน 30 โปรเจกต์ และเซสชันไม่เกิน 200 เซสชัน | แถบด้านซ้าย | `frontend/src/lib/chat.ts:52-54`, `strings.projectLimit` |
| ถังขยะเก็บ 7 วัน | ถังขยะ | `strings.trashNote` |
| ชื่อเรื่องเอกสารบังคับ ≤200 ตัวอักษร ผู้เขียน ≤20 คน คำสำคัญ ≤8 บทคัดย่อ ≤3000 ข้อความปิดท้ายข้อละ ≤1500 ตารางกว้าง ≤12 คอลัมน์ ช่อง ≤500 | สร้างเอกสาร | `frontend/src/lib/exportReport.ts:15` (LIM), `strings.fNeedTitle`, `fAuthorsHelp`, `fKeywordsHelp` |
| ข้อความปิดท้ายเป็นแบบร่างกลาง ผู้ใช้ต้องแก้ให้ตรงความจริง | รายละเอียดบทความ | `strings.fStatementsHelp`, `fStmtUnedited` |
| การตรวจอ้างอิงยืนยันเพียงว่าเลขอ้างอิงมีอยู่จริง | ทุกที่ที่แสดงป้าย | `strings.idCheckNote`, `landing.th.checkBody` |

## 7. ข้อความแจ้งเตือนที่ผู้ใช้อาจพบ (messages users can meet)
ข้อความทั้งหมดคัดจาก `frontend/src/lib/strings.ts` (ภาษาไทยและอังกฤษ) หน้าที่ใช้ข้อความเหล่านี้เป็นหัวข้อปัญหา: ask-a-question, review-plan, ask-documents, analyze-data, manage-files, create-report, report-details, trash, faq

| ข้อความ (th) | เกิดเมื่อ | ผู้ใช้ควรทำ | key |
|---|---|---|---|
| คำถามยาวเกิน 2000 ตัวอักษร | พิมพ์ยาวเกิน | ตัดคำถามให้สั้นลง | `tooLong` |
| คำถามนี้อยู่นอกขอบเขตของระบบ | ถามนอกวิทยาศาสตร์วิจัย | ถามเรื่องงานวิจัย | `refused` |
| คำขอนี้พยายามเปลี่ยนคำสั่งของระบบ ระบบไม่ทำตาม | ข้อความสั่งให้ระบบเปลี่ยนกฎ | ถามคำถามวิจัยตามปกติ | `refusedInjection` |
| ระบบทำสิ่งนี้ให้ไม่ได้ (เช่น เขียนงานแทน วินิจฉัยโรค หรืออ่านไฟล์และข้อมูลลับ) | ขอเขียนงานแทน ฯลฯ | ถามหาหลักฐานแทน | `refusedUnsafe` |
| คำถามนี้ต้องการงานวิจัยใหม่ แต่โหมดถามต่อตอบได้เฉพาะจากผลที่ค้นไว้แล้วในเซสชันนี้ | โหมดตอบคำถามแต่ต้องค้นเพิ่ม | สลับเป็นค้นหา | `refusedNeedsSearch` |
| ตรวจขอบเขตคำถามไม่สำเร็จ ลองใหม่อีกครั้ง | ตรวจขอบเขตล้มเหลว | ลองอีกครั้ง | `refusedCheckFailed` |
| คุณมีงานรออยู่ครบแล้ว รอให้งานเดิมเสร็จก่อน | ส่งงานเกินจำนวนที่คิวรับต่อคน | รอหรือหยุดงานเดิม | `runClientBusy` |
| คิวเต็ม ลองใหม่อีกครู่ | คิวของเซิร์ฟเวอร์เต็ม | ลองใหม่ภายหลัง | `runQueueFull` |
| การทำงานล้มเหลว ลองอีกครั้งได้ / การทำงานถูกขัดจังหวะ (เช่น โหลดหน้าใหม่) ลองอีกครั้งได้ | งานจบด้วยข้อผิดพลาดหรือถูกขัดจังหวะ | คลิก "ลองอีกครั้ง" | `runFailed`, `interrupted` |
| เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ / การเชื่อมต่อสิ้นสุดก่อนที่คำตอบจะเสร็จสมบูรณ์ | เครือข่ายหรือเซิร์ฟเวอร์ขัดข้อง | ตรวจอินเทอร์เน็ต ลองใหม่ | `network`, `cutOff` |
| แนบ PDF ได้สูงสุด 5 ไฟล์ / เลือก PDF หลายไฟล์ หรือไฟล์ข้อมูล 1 ไฟล์ อย่างใดอย่างหนึ่ง | แนบเกิน/ปนชนิด | แนบใหม่ตามเงื่อนไข | `docsMax`, `attachOneKind` |
| อ่านไฟล์ {name} เป็น PDF ไม่ได้ (ไฟล์อาจเสียหรือมีรหัสผ่าน) / ไม่มีข้อความที่อ่านได้ใน {name} (อาจเป็นภาพสแกน) | PDF เสียหรือสแกน | ใช้ไฟล์ที่เลือกข้อความได้ | `docsUnreadable`, `docsEmptyFile` |
| การถามจากเอกสารต้องใช้ฐานข้อมูลร่วมของเซิร์ฟเวอร์ ซึ่งยังไม่พร้อมใช้งาน | เซิร์ฟเวอร์ไม่มีฐานข้อมูลร่วม | แจ้งผู้ดูแลเซิร์ฟเวอร์ | `docsNeedsDb` |
| การวิเคราะห์ไฟล์ยังไม่เปิดใช้งานบนเซิร์ฟเวอร์นี้ | เซิร์ฟเวอร์ปิดการวิเคราะห์ | แจ้งผู้ดูแล | `attachUnavailable` |
| คำค้นต้องเป็นภาษาอังกฤษเท่านั้น / โปรดใส่คำค้น | แก้แผน | แก้คำค้น | `planTermEnglish`, `planTermRequired` |
| ต้องใส่ชื่อเรื่อง, หัวข้อยาวเกิน 200..., ตารางกว้างเกิน 12..., เกินจำนวนที่ระบบรับได้... | สร้างเอกสาร | ตามข้อความ | `fNeedTitle`, `fHeadingLong`, `fTableWide`, `fTooMany` |
| ข้อมูลไม่ถูกต้องหรือเกินขีดจำกัด ตรวจชื่อเรื่อง หัวข้อ และย่อหน้า / ระบบสร้างไฟล์ยังไม่พร้อม... | เซิร์ฟเวอร์ปฏิเสธการสร้างไฟล์ | แก้เนื้อหา/ลองใหม่ | `fErr422`, `fErr503` |
| บันทึกไฟล์ไม่สำเร็จ ยังไม่มีอะไรถูกเพิ่มในไฟล์ของฉัน... | บันทึก PDF/Word ล้มเหลว | ลองอีกครั้ง | `fSaveFail` |
| คำชี้แจงท้ายเอกสารบางข้อยังเป็นข้อความตั้งต้นหรือมี [ ] ที่ยังไม่ได้กรอก ตรวจสอบก่อนส่ง | เลือกข้อความปิดท้ายแต่ไม่แก้ | แก้ข้อความ | `fStmtUnedited` |
| ถังขยะใช้ได้เมื่อเชื่อมต่อฐานข้อมูลร่วม / สถิติใช้ได้เมื่อเชื่อมต่อฐานข้อมูลร่วม | ไม่มีฐานข้อมูลร่วม | แจ้งผู้ดูแล | `trashOff`, `usageOff` |
| ข้อมูลนี้ถูกแก้ไขโดยผู้อื่นแล้ว เราโหลดเวอร์ชันล่าสุดให้ | คนอื่นแก้รายการเดียวกัน | ตรวจข้อมูลล่าสุด | `noticeConflict` |

## 8. ระบบภายนอกและข้อจำกัด (integrations and limits)
- ผู้ให้บริการโมเดล (OpenRouter) รับคำถามและข้อความที่ค้นพบเพื่อสร้างคำตอบ จึงไม่ควรใส่ข้อมูลส่วนบุคคล (`strings.landing.data[0]`, `README.md` Privacy)
- ตรวจเลขอ้างอิงกับ Crossref, PubMed, arXiv (`README.md`, `strings.landing.capCheck`) ค้นจาก OpenAlex, PubMed, arXiv และฐานข้อมูลสาธารณะอื่น (`landing.th.chipSearch`, `backend/src/scientist/sources.py`)
- การวิเคราะห์ไฟล์รันใน Docker แซนด์บ็อกซ์ที่ไม่มีอินเทอร์เน็ต (`strings.landing.data[1]`, `backend/src/scientist/sandbox.py`)
- ขอบเขตการทำงาน: คำค้นสูงสุด 5 ต่อคำถาม (`README.md` MAX_BRANCHES) แต่ละคำค้นใช้เวลาได้ถึง 5 นาที (`strings.slowHint`) ระบบทำงานพร้อมกันได้จำกัด งานส่วนเกินเข้าคิว (`README.md` MAX_CONCURRENT_RUNS=4 ตามค่าตั้งต้น, `strings.serverLoad`)
- ฐานข้อมูลสาธารณะบางแห่งต้องใช้ key ของเซิร์ฟเวอร์ (`frontend/src/lib/sources.ts:91` KEY_GATED) ยังไม่ทราบว่าติดตั้งชุดใดบ้าง (Q-07)
- Feature flag ใน `.env.example`: ENABLED_SKILLS, PRESIGN_ENABLED, REVIEW_ENABLED, SANDBOX_ENABLED เป็นการตั้งค่าเซิร์ฟเวอร์ ผู้ใช้เห็นเพียงผล (เช่น ไม่มีผู้ตรวจทาน ไม่มีการวิเคราะห์ไฟล์) คู่มือไม่บรรยายตัวแปร

## 9. ข้อมูลที่ผู้ใช้จัดการ (data the user handles)
- คำถามวิจัย ไฟล์ PDF และไฟล์ข้อมูล ชื่อผู้เขียนและหน่วยงานในเอกสารรายงาน (ช่อง "ผู้เขียน") อาจเป็นข้อมูลส่วนบุคคล ผู้เขียนใส่เอง (`strings.fAuthorsHelp`)
- ข้อมูลอยู่ในฐานข้อมูลร่วมของเซิร์ฟเวอร์ ทุกคนที่เข้าถึงเห็นเหมือนกัน หรืออยู่ในเบราว์เซอร์นี้เมื่อไม่มีฐานข้อมูล (`strings.dataNote`, `dataNoteShared`, `syncLocal`)
- ไฟล์ที่ส่งออก: PDF, Word (.docx), Markdown (.md), LaTeX (.tex), BibTeX, RIS, ไฟล์ที่มา (JSON) (`strings.rpPdf`, `rpDocx`, `rpMd`, `fDownloadTex`, `downloadBibtex`, `downloadRis`, `downloadProvenance`)
- แชตจากเวอร์ชันเก่าที่ยังอยู่ในเบราว์เซอร์นำเข้าไปฐานข้อมูลร่วมได้ (`frontend/src/lib/importOld.ts:8`, `strings.importTitle`)

## 10. แผนคู่มือ (manual plan)
### เล่ม (books)
| เล่ม | ชื่อเล่ม | ผู้อ่าน |
|---|---|---|
| user-guide | คู่มือผู้ใช้ / User guide | นักวิจัย นักศึกษา และผู้ที่ต้องการค้นคว้างานวิชาการพร้อมแหล่งอ้างอิง |

### บทและหน้า (chapters and pages)
เรียงตามเมนูของแอป: หน้าแรก → แชต (ถาม อ่าน ส่งออก) → ไฟล์ → รายงาน → แชตและโปรเจกต์ → ถังขยะ → การตั้งค่า → สถิติ → ขอบเขตและปัญหา

| page id | ชื่อหน้า | ชนิด | routes / sources | ครอบคลุม |
|---|---|---|---|---|
| about | เกี่ยวกับคู่มือนี้ | concept | `/how-it-works`, `/faq`, `/features/[slug]` | F18 |
| getting-started | เริ่มต้นใช้งาน | how-to | `/`, `/chat` | F1 |
| ask-a-question | ถามคำถามวิจัย | how-to | `/chat`; Composer.tsx, packs.ts | F2 F3 F5 |
| review-plan | ตรวจและแก้แผนก่อนค้นหา | how-to | PlanCard.tsx | F4 |
| read-sources | เปิดดูแหล่งข้อมูลของคำตอบ | how-to | AnswerView.tsx, SourceInspector.tsx | F6 |
| export-references | คัดลอกคำตอบและส่งออกรายการอ้างอิง | how-to | AgentMessage.tsx, provenance.ts | F7 |
| ask-documents | ถามจากเอกสาร PDF | how-to | Composer.tsx | F8 |
| analyze-data | วิเคราะห์ไฟล์ข้อมูล | how-to | AnalysisArtifact.tsx | F9 |
| manage-files | อัปโหลดและดูตัวอย่างไฟล์ | how-to | `/files` | F10 |
| create-report | สร้างเอกสารรายงานจากคำตอบ | how-to | ReportPanel.tsx, ReportForm.tsx | F11 |
| report-details | ใส่ประเภทบทความ ผู้เขียน และข้อความปิดท้าย | how-to | ReportForm.tsx, paperOutline.ts | F12 |
| export-latex | ดาวน์โหลดบทความเป็น LaTeX | how-to | ReportForm.tsx | F13 |
| find-chats | ค้นหาและเปิดแชตเดิม | how-to | SessionList.tsx | F14 |
| organize-chats | จัดแชตเข้าโปรเจกต์ | how-to | ProjectTree.tsx, SessionMenu.tsx | F14 |
| delete-chat | ลบแชต | how-to | ProjectTree.tsx | F14 F15 |
| trash | กู้คืนรายการจากถังขยะ | how-to | `/trash` | F15 |
| language-theme | เปลี่ยนภาษาและธีม | how-to | SettingsDialog.tsx | F16 |
| plan-setting | เปิดหรือปิดการตรวจแผนก่อนค้นหา | how-to | SettingsDialog.tsx | F16 |
| data-and-privacy | ข้อมูลของคุณถูกเก็บและส่งไปที่ไหน | concept | SettingsDialog.tsx, ImportOld.tsx | F16 |
| usage | ดูสถิติการใช้งาน | how-to | `/usage` | F17 |
| limits-and-safety | ขอบเขตของระบบและสิ่งที่ผู้อ่านต้องตรวจเอง | concept | guardrail.py | F19 |
| faq | ปัญหาที่พบบ่อยและวิธีแก้ไข | reference | strings.ts | ข้อความใน §7 |

### สื่อประกอบ (media plan)
ระดับสื่อ `steps` ไม่มีวิดีโอ ภาพทั้งหมดถ่ายจากแอปจริงที่รันในเครื่อง (`http://localhost:3100`) ด้วยข้อมูลทดสอบที่สมมติ

| id | หน้า | หน้าจอ | หมายเหตุข้อมูลทดสอบ |
|---|---|---|---|
| start-open | getting-started | หน้าแรก → แชต | ไม่มี |
| chat-home (shot) | getting-started | หน้าแชตว่าง | ไม่มี |
| ask-flow | ask-a-question | ช่องคำถาม โหมด สาขา ปุ่มส่ง | ไม่ส่งจริง ใช้ตัวอย่างคำถามของแอป (Tab) |
| plan-flow | review-plan | การ์ดแผนวิจัย | ส่งคำถามสมมติให้ถึงขั้นแผน ไม่กดเริ่มค้นหา |
| source-flow | read-sources | คำตอบตัวอย่างและแผงแหล่งข้อมูล | ใช้แชตตัวอย่างเดิม "เปรียบเทียบ RAG กับ fine-tuning" |
| ref-flow | export-references | แถบเครื่องมือคำตอบ | แชตตัวอย่างเดิม |
| docs-flow, docs-files-flow | ask-documents | แนบ PDF ถามและตอบ / เลือกจาก "ไฟล์ของฉัน" | `manual/assets/sample-paper.pdf` (เนื้อหาสมมติ) คำถามเป็นภาษาอังกฤษทั้งสองภาษา |
| data-flow | analyze-data | วิเคราะห์ CSV | `manual/assets/sample-experiment.csv` (ข้อมูลสุ่มสมมติ) |
| files-flow | manage-files | ไฟล์ของฉัน อัปโหลด ตัวอย่าง | `manual/assets/water-trial.csv` |
| report-flow | create-report | แผงรายงานและฟอร์มสร้างเอกสาร | แชตตัวอย่างเดิม ไม่กดบันทึก |
| details-flow | report-details | หน้าต่างรายละเอียดบทความ | ชื่อผู้เขียนสมมติ |
| latex-flow | export-latex | เลือกรูปแบบ LaTeX | ไม่ดาวน์โหลดจริง |
| find-flow | find-chats | ค้นหาแชต | คำค้น "RAG" |
| organize-flow | organize-chats | สร้างโปรเจกต์ ย้ายแชต | ไม่กดยืนยัน ไม่เปลี่ยนข้อมูล |
| delete-flow | delete-chat | เมนูลบและกล่องยืนยัน | ไม่กดยืนยัน |
| trash-flow | trash | ถังขยะ | รายการในถังขยะเป็นข้อมูลทดสอบอยู่แล้ว |
| language-flow, plan-setting-flow | language-theme, plan-setting | หน้าต่างการตั้งค่า | ไม่กดเปลี่ยน |
| usage-flow | usage | สถิติการใช้งาน | ตัวเลขจากการใช้ทดสอบ |
| settings-data (shot) | data-and-privacy | ส่วนข้อมูลของการตั้งค่า | ไม่กดลบ |
| refused (shot) | limits-and-safety | ข้อความปฏิเสธ | คำถามสมมติเขียนวิทยานิพนธ์แทน |

สิ่งที่การถ่ายภาพสร้างในข้อมูลทดสอบ: `plan-flow`, `docs-flow`, `data-flow` และ `refused` ส่งคำถามจริงหนึ่งข้อต่อภาษา (แชตใหม่ในโปรเจกต์ "ส่วนตัว") `plan-flow` ให้โมเดลวางแผนหนึ่งครั้งแล้วหยุดที่แผน `files-flow` อัปโหลด `water-trial.csv` หนึ่งไฟล์ต่อภาษา และ `docs-flow` แนบ `sample-paper.pdf` ซึ่งขึ้นใน "ไฟล์ของฉัน" ด้วย ควรลบรายการซ้ำหลังถ่ายภาพ

ข้อมูลทดสอบที่ต้องมีก่อนถ่าย: แชตตัวอย่าง "เปรียบเทียบ RAG กับ fine-tuning สำหรับการตอบคำถามทางการแพทย์" ที่ตอบเสร็จแล้ว (9 แหล่งข้อมูล) ไฟล์ `sample-experiment.csv` และ `sample-paper.pdf` ใน "ไฟล์ของฉัน" และโปรเจกต์ตัวอย่างอย่างน้อยหนึ่งโปรเจกต์

### การครอบคลุม (coverage mapping)
| รายการจาก discovery | หน้า | หมายเหตุ |
|---|---|---|
| route `/` | getting-started | |
| route `/chat` | ask-a-question และหน้าอื่นที่ใช้แชต | |
| route `/files` | manage-files | |
| route `/trash` | trash | |
| route `/usage` | usage | |
| route `/how-it-works`, `/faq`, `/features/[slug]` | about | หน้าเว็บสาธารณะ อธิบายรวมในหน้า about |
| route `/ask`, `/saved` | (ignored) | ส่งต่อไป `/chat` ทันที (`frontend/src/app/ask/page.tsx`) |
| route `/docs` | (ignored) | หน้าแจ้งว่าคู่มือกำลังพัฒนา (Q-05) |
| roles, permissions | ไม่มี | 0 รายการ |

## 11. คำถามที่ต้องยืนยัน (to confirm)
- [ ] Q-01 (รอระบุ) เลขที่เอกสาร ผู้อนุมัติ ชื่อลูกค้า ชื่อบริษัทผู้พัฒนา ผู้ติดต่อ ใน `manual/manual.config.yaml` ยังเป็น `(รอระบุ)` หรือว่าง
- [ ] Q-02 (รอระบุ) ขนาดไฟล์สูงสุดที่อัปโหลดได้ ค่าตั้งต้นในโค้ดคือ PDF/DOCX 30 MB, CSV/Parquet 100 MB, JSON 50 MB, XLSX 25 MB (`backend/src/scientist/config.py:72-77`) หน้าจอไม่บอกตัวเลข คู่มือจึงไม่ระบุขนาด จนกว่าจะยืนยันค่าที่ติดตั้งจริง
- [ ] Q-03 (รอระบุ) เครื่องที่ส่งมอบมีฐานข้อมูลร่วมเสมอหรือไม่ ถ้าไม่มี ถังขยะ สถิติ และการถามจากเอกสารใช้ไม่ได้ (`strings.trashOff`, `usageOff`, `docsNeedsDb`) คู่มือเขียนว่าฟังก์ชันเหล่านี้ใช้ได้เมื่อเชื่อมฐานข้อมูลร่วม
- [ ] Q-04 (รอระบุ) นโยบายข้อมูลส่วนบุคคล ระยะเก็บข้อมูล และผู้ที่เห็นข้อมูลร่วมกัน ตามที่ระบบไม่มีการเข้าสู่ระบบ ผู้ส่งมอบต้องการข้อความใดในคู่มือ หน้า data-and-privacy ใช้เฉพาะข้อความที่แอปแสดง
- [ ] Q-05 หน้า `/docs` ในแอปแจ้ง "คู่มือกำลังพัฒนา ยังไม่เปิดให้อ่านในตอนนี้" เมื่อส่งมอบคู่มือนี้แล้วจะให้ลิงก์ไปที่ใด
- [ ] Q-06 แหล่งข้อมูลที่ต้องใช้ key ของเซิร์ฟเวอร์ (`frontend/src/lib/sources.ts:91`) และชุดทักษะที่เปิด (`ENABLED_SKILLS`) ในเครื่องที่ส่งมอบ คู่มือจึงไม่ระบุรายชื่อฐานข้อมูล
- [ ] Q-07 บรรทัด "ค่าใช้จ่าย ~$… · … โทเค็น" ใต้คำตอบและหน้า "สถิติการใช้งาน" แสดงต่อผู้ใช้ปลายทางโดยตั้งใจหรือไม่ ถ้าไม่ คู่มือต้องตัดทิ้ง
- [ ] Q-08 ผู้ใช้ปลายทางที่ใช้ API/MCP (`docs/api.md`) ต้องการคู่มือแยกหรือไม่ (ขณะนี้นอกขอบเขต)
- [ ] Q-09 `README.md` ระบุว่ายังไม่ได้ตรวจการทำงานกับโมเดลจริง แต่ผู้เขียนคู่มือเห็นคำถาม แผน เอกสาร และการวิเคราะห์ทำงานจริงบนเครื่องนี้ (2026-11-02) ผู้รับผิดชอบระบบควรยืนยันว่าโมเดลและคีย์ที่ใช้ตอนถ่ายภาพเป็นชุดเดียวกับที่ส่งมอบ
- [ ] Q-11 วิธีถ่ายภาพ: (ก) เปิดเว็บแอปแบบ production ที่ต้นทางที่เซิร์ฟเวอร์หลังบ้านอนุญาต (ปัจจุบันอนุญาตเฉพาะ `http://localhost:3100` และ `http://127.0.0.1:3100`) แล้วรัน `manual-kit capture` หรือ (ข) อนุญาตให้ใช้เบราว์เซอร์ที่ปิดข้อตรวจ Local Network Access เฉพาะตอนถ่ายภาพบนเครื่องนี้ ขณะนี้ยังไม่มีภาพใดถูกถ่ายด้วยเครื่องมือ
- [ ] Q-10 ภาพหน้าจอภาษาอังกฤษใช้แชตตัวอย่างเดียวกัน (เนื้อหาคำตอบเป็นภาษาไทย) และคำถามเอกสารกับข้อมูลเป็นภาษาอังกฤษทั้งสองภาษา เพราะ spec ของภาพ 1 ชุดใช้กับทั้งสองภาษา ต้องการให้เตรียมแชตตัวอย่างภาษาอังกฤษแยกหรือไม่

## 12. ปัญหาของระบบที่พบระหว่างทำคู่มือ (product issues found)
- เมื่อเปิดร่างรายงานที่แผงขวาบนจอกว้าง 1280 พิกเซล ช่องคำถามถูกบีบเป็นแถบแคบจนข้อความเรียงเป็นแนวตั้ง (seen: `/chat` หลังกด "เปิดรายงาน", 2026-11-02)
- หน้าให้ข้อมูลบอกให้ "กดเลขอ้างอิง [n] ในคำตอบ" (`strings.sitePages.th.features.references.steps[2]`) แต่คำตอบค้นหาแสดงชื่อ "ผู้เขียน ปี" เป็นป้ายให้กด เช่น "Yucheng et al. 2023" ส่วนเลข [1] ปรากฏในคำตอบจากเอกสาร (seen: `/chat`, 2026-11-02) คู่มือเรียกว่า "ชื่ออ้างอิง" ตามที่เห็น
- หน้า "ไฟล์ของฉัน" ที่ว่างบอกว่า "รายการนี้เก็บไว้ในเบราว์เซอร์นี้เท่านั้น" (`strings.th.filesEmptyBody`) ขณะที่แอปบอกว่าข้อมูลอยู่ในฐานข้อมูลร่วม (`dataNoteShared`) ข้อความขัดกัน
- เมนู "คู่มือ" บนหน้าแรกนำไป `/docs` ซึ่งยังบอกว่าคู่มือกำลังพัฒนา (`strings.sitePages.th.docs.lead`)
- `README.md` บอกพอร์ต 3000/8000 แต่เครื่องทดสอบนี้ใช้ 3100/8100 (ไม่กระทบผู้ใช้ ตั้งค่าได้ที่ `capture.baseUrl`)
- ยังถ่ายภาพด้วย `manual-kit capture` ไม่ได้ (ไม่ใช่ข้อบกพร่องของแอป): `capture` ตอบคำขอทุกอย่างเอง ทำให้ Chromium มองหน้าเว็บเป็นแหล่งภายนอก และบล็อกการเชื่อมต่อ HMR WebSocket ของเซิร์ฟเวอร์พัฒนา Next.js ที่ localhost (net::ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS) หน้าเว็บจึงไม่เติมข้อมูลและไม่แสดงช่องคำถาม ภาพที่ได้เป็นหน้าว่าง ทางแก้ที่พบต้องปิดข้อตรวจความปลอดภัยของเบราว์เซอร์ ผู้เขียนคู่มือจึงไม่ได้ใช้ ต้องให้ผู้รับผิดชอบเลือกทาง (Q-11)

## 13. นอกขอบเขต (out of scope)
- การติดตั้งและดูแลเซิร์ฟเวอร์ (`docs/deploy.md`): ผู้ใช้ปลายทางไม่เกี่ยว
- Public API, Python SDK และ MCP (`docs/api.md`, `sdk/`): ผู้ใช้เชิงเทคนิค เสนอเป็นเล่มแยกถ้าต้องการ (Q-08)
- DOCX ของคู่มือ: ไม่เปิดใน `outputs` (เปิดเฉพาะ PDF และเว็บ)
- วิดีโอสาธิต: ระดับสื่อ `steps`
- หน้า `/docs`, `/ask`, `/saved`: ดูตารางครอบคลุม
- การรับรองหน้า (`manual-kit sign`): ผู้รับผิดชอบเป็นคนทำหลังอ่านทวน
- การจัดการแชตหลายรายการพร้อมกัน การย้ายโปรเจกต์ของไฟล์ (มีในเมนูไฟล์ แต่ไม่ได้เขียนเป็นหน้าแยก): เพิ่มได้ภายหลัง
