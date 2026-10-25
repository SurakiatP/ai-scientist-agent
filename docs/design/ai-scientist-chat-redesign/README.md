# AI Scientist — chat-first UI direction

ชุดภาพนี้เป็น **visual reference สำหรับการพัฒนา UI** ไม่ใช่ภาพหน้าจอจากระบบที่ทำงานแล้ว ใช้แบรนด์ AI Scientist แยกจาก NECTEC และใช้โทนที่ผู้ใช้เลือก: **Obsidian / Arctic Teal**. เมื่อกดเริ่มต้นใช้งานบน Landing ให้เข้าหน้าแชตทันที โหมดสว่างเป็นส่วนหนึ่งของทิศทางเดียวกัน ไม่ใช่ธีมรอง

## ลำดับหน้าจอและ component

| # | ภาพ | หน้าที่และ component สำคัญ |
|---|---|---|
| 01 | [Landing · Dark](images/01-landing-dark.png) | แนะนำคุณค่าของระบบ, CTA เริ่มต้นใช้งาน, วิธีทำงาน, ตัวเลือกภาษา/ธีม; ใช้ตัวอักษรและรูปทรง UI เท่านั้น ไม่มีภาพถ่าย/ภาพประกอบ |
| 02 | [Chat home · Dark](images/02-chat-home-dark.png) | Sidebar โปรเจกต์/เซสชัน, project switcher, ช่องถามและแนบไฟล์, mode selector, prompt starters |
| 03 | [Deep Research running · Dark](images/03-deep-research-running-dark.png) | ข้อความสนทนา, แผนวิจัยที่แก้ได้, ขั้นตอนพร้อมสถานะ, แหล่งข้อมูล/ความคืบหน้า, composer ระหว่างทำงาน |
| 04 | [Answer with citations · Dark](images/04-answer-citations-dark.png) | คำตอบ, citation markers, รายการหลักฐาน, action ถามต่อ/คัดลอก/ส่งออก |
| 05 | [Off-topic response · Dark](images/05-off-topic-response-dark.png) | คำปฏิเสธสั้นและสุภาพสำหรับคำถามนอกงานวิจัย พร้อมทางลัดกลับไปตั้งโจทย์วิจัย |
| 06 | [Projects and sessions · Dark](images/06-project-sessions-dark.png) | จัดโปรเจกต์, เลือกและค้นเซสชัน, metadata และ action ของรายการ |
| 07 | [Source inspector · Dark](images/07-source-inspector-dark.png) | แผงตรวจหลักฐานข้างบทสนทนา แสดง metadata, ลิงก์ต้นทาง และตำแหน่งที่ถูกอ้าง |
| 08 | [Analysis artifact · Dark](images/08-analysis-artifact-dark.png) | ผลวิเคราะห์แบบ artifact, ตาราง/กราฟ, provenance, ส่งออก |
| 09 | [Report artifact · Dark](images/09-report-artifact-dark.png) | ตัวอย่างรายงานที่ผูกกับบทสนทนา, โครงร่าง, citation และการส่งออก |
| 10 | [Settings · Dark](images/10-settings-dark.png) | ภาษา, ธีม Light/Dark/System, การตั้งค่าการใช้งาน |
| 11 | [Landing · Light](images/11-landing-light.png) | Landing เดียวกับ 01 ในชุดสีสว่าง; ไม่มีภาพถ่าย/ภาพประกอบ |
| 12 | [Chat home · Light](images/12-chat-home-light.png) | หน้าเริ่มสนทนาในชุดสีสว่าง |
| 13 | [Answer with citations · Light](images/13-answer-citations-light.png) | การอ่านคำตอบ/อ้างอิงในชุดสีสว่าง |
| 14 | [Settings · Light](images/14-settings-light.png) | ตัวอย่างการตั้งค่า theme และภาษาในชุดสีสว่าง |
| 15 | [Mobile chat home · Dark](images/15-chat-home-mobile-dark.png) | Mobile header, project switcher, composer, starter cards |
| 16 | [Mobile chat home · Light](images/16-chat-home-mobile-light.png) | หน้าแชตมือถือในชุดสีสว่าง |
| 17 | [Mobile research running · Dark](images/17-deep-research-mobile-dark.png) | แผนและความคืบหน้าแบบ single column, composer ด้านล่าง |
| 18 | [Mobile Landing · Light](images/18-landing-mobile-light.png) | CTA และขั้นตอนการทำงานบนมือถือโดยไม่มีภาพประกอบ |
| 19 | [English chat home · Light](images/19-chat-home-english-light.png) | ตัวอย่าง copy และโครงสร้างสำหรับ locale ภาษาอังกฤษ |

ภาพ mockup จาก image generation อาจมีตัวสะกดหรือรายละเอียดเล็กน้อยคลาดเคลื่อน ให้ใช้ [CLAUDE-HANDOFF.md](CLAUDE-HANDOFF.md) เป็นข้อกำหนดด้านพฤติกรรมและคัดข้อความ UI ในโค้ดอย่างตั้งใจ อย่า OCR ภาพมาใช้ตรง ๆ

## เอกสารประกอบ

- [สเปก UX และสถานะ](../../superpowers/specs/2026-10-24-ai-scientist-chat-redesign.md)
- [แนวทางสี](THEME-OPTIONS.md)
- [Generation log](GENERATION-LOG.md)
- [Claude Code handoff](CLAUDE-HANDOFF.md)
- [Prompt พร้อมสั่ง Claude Code](CLAUDE-IMPLEMENTATION-PROMPT.md)

**หมายเหตุเรื่องข้อมูล:** ชื่อเอกสาร งานวิจัย DOI/PMID จำนวนผลค้นหา กราฟ และค่าต่าง ๆ ในภาพเป็นข้อมูลจำลอง แหล่งค้นหาอย่าง Scopus/Web of Science เป็นเพียงตัวอย่าง UI; ยังไม่ยืนยันสิทธิ์หรือ integration จริง ห้ามแสดงเป็นผลวิจัยจริงใน production
