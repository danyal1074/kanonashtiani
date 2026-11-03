import sys
import os
import json
import re
import unicodedata
try:
    import pymupdf as fitz
except ImportError:
    import fitz

sys.stdout.reconfigure(encoding='utf-8')

FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
EN_DIGITS = '0123456789'
TRANS_TO_EN = str.maketrans(FA_DIGITS, EN_DIGITS)

def to_en(s):
    if not s:
        return ''
    return str(s).translate(TRANS_TO_EN).strip()

def clean_name(name):
    if not name:
        return ''
    name = unicodedata.normalize('NFKC', name).strip()
    name = re.sub(r'^(?:نام و نام خانوادگی|ﻧﺎم و ﻧﺎم ﺧﺎﻧﻮادﮔﯽ)\s*[:：]?', '', name)
    name = re.sub(r'[:：]', '', name).strip()
    return name

def parse_full_page(page, page_idx):
    text = page.get_text()
    raw_lines = text.split('\n')
    lines = [unicodedata.normalize('NFKC', l.strip()) for l in raw_lines if l.strip()]

    # 1. Header info
    exam_title = "مرحله اول برپا | پایه‌ی نهم"
    full_name = ""
    candidate_code = ""
    school_name = "شهید کاظمی آشتیانی"
    total_attendees = 1924

    for l in lines[:15]:
        en_l = l.translate(TRANS_TO_EN)
        if 'داوطلبی' in l or 'داوﻃﻠﺒﯽ' in l:
            m_code = re.search(r'(\d{8,12})', en_l)
            if m_code:
                candidate_code = m_code.group(1)
            parts = l.split(':')
            for p in parts:
                p_clean = p.replace('نام و نام خانوادگی', '').replace('کد داوطلبی', '').strip()
                p_clean = re.sub(r'[\d۰-۹]+', '', p_clean).strip()
                if p_clean and not full_name:
                    full_name = clean_name(p_clean)
        if 'تعداد حاضرین' in l:
            m_att = re.search(r'(\d+)', en_l)
            if m_att:
                total_attendees = int(m_att.group(1))
        if 'مجموعه' in l:
            sch = l.replace('مجموعه', '').replace(':', '').replace('：', '').strip()
            if sch:
                school_name = sch

    if not full_name:
        for l in lines[:8]:
            if 'نام و نام خانوادگی' in l:
                full_name = clean_name(l.replace('نام و نام خانوادگی', ''))
                break

    # Clean any leftover candidate code or 'کد داوطلبی' inside full_name
    full_name = re.sub(r'[\d۰-۹]+', '', full_name).replace('کد داوطلبی', '').strip()

    if not full_name or full_name.isdigit():
        code_val = candidate_code[-3:] if candidate_code else f"{page_idx+1}"
        full_name = f"دانش‌آموز {code_val}"

    # 2. Subjects (نتایج دروس)
    subjects_kw = [
        {'name': 'عربی', 'icon': 'book-open', 'color': '#0A4BD6'},
        {'name': 'مطالعات اجتماعی', 'icon': 'globe', 'color': '#059669'},
        {'name': 'زبان و ادبیات فارسی', 'icon': 'feather', 'color': '#D97706'},
        {'name': 'قرآن و معارف اسلامی', 'icon': 'sun', 'color': '#7C3AED'},
        {'name': 'علوم تجربی', 'icon': 'flask-conical', 'color': '#0891B2'},
        {'name': 'ریاضی', 'icon': 'calculator', 'color': '#DC2626'},
        {'name': 'استعداد تحلیلی', 'icon': 'brain', 'color': '#4F46E5'}
    ]

    subjects = []
    last_subj_idx = 8
    for item in subjects_kw:
        sname = item['name']
        for idx in range(last_subj_idx, len(lines)):
            l = lines[idx]
            if sname in l and 'نتایج' not in l and 'نام درس' not in l:
                raw_nums = []
                for j in range(last_subj_idx, idx):
                    for tok in lines[j].split():
                        en_tok = tok.translate(TRANS_TO_EN)
                        if '-' in en_tok:
                            clean_num = en_tok.replace('-', '').strip()
                            if clean_num.isdigit():
                                raw_nums.append(-int(clean_num))
                                continue
                        if re.match(r'^\d+$', en_tok):
                            raw_nums.append(int(en_tok))
                
                cnt_match = re.search(r'(\d+)', l.translate(TRANS_TO_EN))
                cnt = int(cnt_match.group(1)) if cnt_match else 0
                
                # In order: [rank_all, rank_center, traz, percentage, unanswered, wrong, correct]
                if len(raw_nums) >= 7:
                    rank_all = raw_nums[0]
                    rank_center = raw_nums[1]
                    traz = raw_nums[2]
                    pct = raw_nums[3]
                    unanswered = raw_nums[4]
                    wrong = raw_nums[5]
                    correct = raw_nums[6]
                    subjects.append({
                        'name': sname,
                        'icon': item['icon'],
                        'color': item['color'],
                        'count': cnt,
                        'correct': correct,
                        'wrong': wrong,
                        'unanswered': unanswered,
                        'percentage': pct,
                        'traz': traz,
                        'rank_center': rank_center,
                        'rank_all': rank_all
                    })
                    last_subj_idx = idx + 1
                    break

    # 3. Overall Categories (نتایج کلی)
    start_cat_idx = 0
    for idx, l in enumerate(lines):
        if 'نتایج کلی' in l:
            start_cat_idx = idx + 9
            break

    cat_specs = [
        {'name': 'عمومی', 'label': 'دروس عمومی'},
        {'name': 'اختصاصی', 'label': 'دروس اختصاصی'},
        {'name': 'هوش', 'label': 'هوش و استعداد تحلیلی'},
        {'name': 'کل', 'label': 'نتیجه کل آزمون'}
    ]

    categories = []
    last_cat_idx = start_cat_idx
    for cspec in cat_specs:
        cname = cspec['name']
        for idx in range(last_cat_idx, len(lines)):
            l = lines[idx]
            if cname in l and 'نتایج' not in l and 'نام دسته' not in l:
                raw_nums = []
                for j in range(last_cat_idx, idx):
                    for tok in lines[j].split():
                        en_tok = tok.translate(TRANS_TO_EN)
                        if '-' in en_tok:
                            clean_num = en_tok.replace('-', '').strip()
                            if clean_num.isdigit():
                                raw_nums.append(-int(clean_num))
                                continue
                        if re.match(r'^\d+$', en_tok):
                            raw_nums.append(int(en_tok))
                
                cnt_match = re.search(r'(\d+)', l.translate(TRANS_TO_EN))
                cnt = int(cnt_match.group(1)) if cnt_match else 0
                
                if len(raw_nums) >= 6:
                    rank_all = raw_nums[0]
                    rank_center = raw_nums[1]
                    traz = raw_nums[2]
                    unanswered = raw_nums[3]
                    wrong = raw_nums[4]
                    correct = raw_nums[5]
                    pct = round(((correct * 3 - wrong) / (cnt * 3)) * 100, 1) if cnt > 0 else 0
                    categories.append({
                        'name': cname,
                        'label': cspec['label'],
                        'count': cnt,
                        'correct': correct,
                        'wrong': wrong,
                        'unanswered': unanswered,
                        'traz': traz,
                        'rank_center': rank_center,
                        'rank_all': rank_all,
                        'percentage': pct
                    })
                    last_cat_idx = idx + 1
                    break

    # 4. Bubble sheet / Answers with exact coordinates and green/red fills
    drawings = page.get_drawings()
    green_rects = [d['rect'] for d in drawings if d.get('fill') and len(d['fill']) >= 3 and d['fill'][1] > 0.6 and d['fill'][0] < 0.5 and d['fill'][2] < 0.6]
    red_rects = [d['rect'] for d in drawings if d.get('fill') and len(d['fill']) >= 3 and d['fill'][0] > 0.8 and d['fill'][1] < 0.6 and d['fill'][2] < 0.6]

    def check_point_status(point):
        for r in green_rects:
            if r.contains(point):
                return 'correct'
        for r in red_rects:
            if r.contains(point):
                return 'wrong'
        return 'unanswered'

    words = page.get_text('words')
    sheet_words = []
    for w in words:
        if w[0] < 220 and w[1] > 110:
            en_w = unicodedata.normalize('NFKC', w[4]).translate(TRANS_TO_EN)
            if en_w.isdigit():
                sheet_words.append((w[0], w[1], w[2], w[3], int(en_w)))

    columns = [[], [], [], []]
    for sw in sheet_words:
        x_mid = (sw[0] + sw[2]) / 2
        if x_mid < 58:
            columns[0].append(sw)
        elif x_mid < 100:
            columns[1].append(sw)
        elif x_mid < 140:
            columns[2].append(sw)
        else:
            columns[3].append(sw)

    answers = []
    for col in columns:
        col.sort(key=lambda item: item[1])
        lines_in_col = []
        curr_line = []
        for item in col:
            if not curr_line:
                curr_line.append(item)
            else:
                if abs(item[1] - curr_line[0][1]) < 6:
                    curr_line.append(item)
                else:
                    lines_in_col.append(curr_line)
                    curr_line = [item]
        if curr_line:
            lines_in_col.append(curr_line)

        for l_items in lines_in_col:
            l_items.sort(key=lambda item: item[0])
            if len(l_items) >= 2:
                q_num = l_items[0][4]
                choice = l_items[1][4]
                choice_mid = fitz.Point((l_items[1][0] + l_items[1][2]) / 2, (l_items[1][1] + l_items[1][3]) / 2)
                status = check_point_status(choice_mid)
                if choice == 0:
                    status = 'unanswered'
                answers.append({
                    'q': q_num,
                    'choice': choice,
                    'status': status
                })

    answers.sort(key=lambda a: a['q'])
    answers_120 = [a for a in answers if 1 <= a['q'] <= 120]

    total_cat = next((c for c in categories if c['name'] == 'کل'), None)

    return {
        'page': page_idx + 1,
        'exam_title': exam_title,
        'full_name': full_name,
        'candidate_code': candidate_code,
        'school_name': school_name,
        'total_attendees': total_attendees,
        'categories': categories,
        'subjects': subjects,
        'total_summary': total_cat,
        'answers': answers_120
    }

def main():
    pdf_path = sys.argv[1] if len(sys.argv) > 1 else r'C:\Users\danyal\Downloads\مرحله اول برپا نهم 1 (1).pdf'
    json_stdout = '--json-stdout' in sys.argv
    if not os.path.exists(pdf_path):
        if json_stdout:
            print(json.dumps({'error': f'File not found: {pdf_path}'}))
        else:
            print(f"Error: File not found {pdf_path}")
        return
        
    doc = fitz.open(pdf_path)
    all_students = []
    
    for i in range(len(doc)):
        res = parse_full_page(doc[i], i)
        all_students.append(res)
        if not json_stdout:
            t = res['total_summary']
            traz_str = f"Traz: {t['traz']} | Rank: {t['rank_all']}" if t else "No total"
            print(f"Page {i+1:02d}: {res['full_name']} (Code: {res['candidate_code']}) | Subjects: {len(res['subjects'])} | Cats: {len(res['categories'])} | Ans: {len(res['answers'])} | {traz_str}")
        
    out_dir = os.path.join(os.path.dirname(__file__), '..', 'data')
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, 'parsed_barpa_20_students.json')
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(all_students, f, ensure_ascii=False, indent=2)
        
    if json_stdout:
        print("___JSON_START___" + json.dumps(all_students, ensure_ascii=False) + "___JSON_END___")
    else:
        print(f"\nSaved complete 20 student records to {out_file}")

if __name__ == '__main__':
    main()
