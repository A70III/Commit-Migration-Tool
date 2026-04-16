# Commit Migration Tool (Refined Requirements)

เครื่องมือสำหรับ "สับ" และย้าย Commit จาก Base Branch ไปยัง Target Branch อย่างเป็นระบบ พร้อมเช็คความถูกต้องและให้ AI ช่วยเขียน Pull Request ให้แบบเบ็ดเสร็จ

---

## 1. ปัญหาและการแก้ไข (What's Better?)

**สิ่งที่นำออก (The Bad):**
- การให้ผู้ใช้ต้องระบุข้อมูลแบบ Manual ซ้ำซาก (เช่น API Key, Command CI) ถูกปรับให้เป็นแบบจำ (Local/Preset)
- การใช้ Cherry-pick ที่อาจทำให้เกิด Conflict หรือข้ามลำดับ (ถูกแก้เป็นการ Reset Hard ตามลำดับจริงใน Tree)
- ความสับสนระหว่าง Diff ของ Branch: ปรับให้ AI โฟกัสเฉพาะสิ่งใหม่ที่ Target Branch ยังไม่มีเท่านั้น

**สิ่งที่เพิ่มเข้ามา (The Good):**
- **Visual Git Tree**: โชว์เส้นเวลาของโปรเจคแบบชัดเจน ไฮไลท์จุดที่ Target บร๊านช์อยู่เทียบกับ Base
- **Preset System**: จำคำสั่ง CI (Operate), PR Template และ API keys ตามแต่ละโปรเจค หรือใน Local Storage
- **Seamless Flow**: ลื่นไหลตั้งแต่เลือก Commit -> รันเทส -> AI เขียน PR -> ส่งขึ้น GitHub ในหน้าจอเดียว

---

## 2. ขั้นตอนการใช้งานที่ราบรื่น (Optimized Workflow)

**Step 1: โหลดโปรเจคและตั้งค่า (Setup & Config)**
- เลือกโฟลเดอร์โปรเจคที่มี `.git`
- เลือก AI Provider (OpenAI, Gemini, DeepSeek, LM Studio, OpenRouter) พร้อมใส่ API Key (ระบบจำไว้ให้)

**Step 2: วิเคราะห์ Git Tree (Visual Mapping)**
- ระบุ `Base Branch` (ฐานใหญ่/อัปเดตสุด) และ `Target Branch` (ปลายทาง/ตัวเก่ากว่า)
- ระบบแสดง **Git Tree ย้อนหลัง** โดยจะมาร์คป้าย (Tag) ให้เห็นว่า `Target` อยู่ที่ Commit ไหน และมี Commit ไหนบน `Base` ที่นำหน้าอยู่บ้าง
- กฎ: ผู้ใช้จะคลิกเลือก Commit ที่ต้องการไปถึง (ระบบจะถือว่าเป็นการดึง Commit นั้นและก่อนหน้าทั้งหมดที่ Target ยังไม่มีไปด้วยกัน)

**Step 3: ปฏิบัติการ และ ตรวจสอบ (Operate & Validate)**
- ระบบสร้าง Branch ใหม่: โคลนจาก `Base Branch`
- ทำการ `git reset --hard <selected-commit-hash>` เพื่อย้อนสถานะให้เป๊ะตาม Commit ที่เลือก
- ระบบสั่งรันคำสั่ง Local CI / สคริปต์ทำงาน (เช่น `bun run test` หรือ `nx test`)
- ถ้ารันผ่าน (Success) -> ไป Step ตลอด
- ถ้ารันไม่ผ่าน (Failed) -> แสดง Console Log ให้ผู้ใช้ทราบและหยุดการทำงานเพื่อแก้ไข

**Step 4: AI ตรวจสอบและสร้าง PR (AI PR Generation)**
- เมื่อรัน CI ผ่าน ระบบสกัด Git Diff ระหว่าง `Target Branch` กับ `Branch ใหม่`
- โยนข้อมูลใส่ Prompt Template ให้ AI ช่วยสรุป:
  - หัวข้อ PR (Title)
  - รายละเอียด (Changelog/Description) โดยแยกส่วนเพิ่ม-ลดชัดเจน
- ผู้ใช้กดแก้ไข (Edit) ข้อความที่ AI สร้างได้ถ้ายังไม่พอใจ 
- ผู้ใช้พิมพ์เลือก GitHub Username ของ Reviewers (เลือกได้หลายคน)

**Step 5: จบงาน (Push & Pull Request)**
- กดปุ่ม "Ship it!" เพื่อ Push branch ใหม่ขึ้น GitHub
- ยิง API ผ่าน Octokit ไปเปิด Pull Request โดยใช้ข้อมูลที่ AI สร้างไว้และ Assign Reviewer ให้ทันที

---

## 3. สถาปัตยกรรมและเทคโนโลยี (Tech Stack)

- **Engine & API:** Next.js (App Router สำหรับ API Routes จัดการ Backend) + Bun (Runtime)
- **Frontend / UX:** React + Tailwind CSS (Styling รวดเร็วและ Modern)
- **Git Actions:** `simple-git` สำหรับจัดการ Git commands พื้นฐาน ร่วมกับ `Bun.spawn` (ใน API Routes) ไว้รอรับ log ของ Operate
- **AI Integrations:** `@google/generative-ai`, OpenAI SDK, หรือ HTTP Fetch สำหรับ Provider ย่อย
- **GitHub Integration:** `@octokit/rest` สำหรับจัดการสร้าง PR บน GitHub
