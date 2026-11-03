import { modal, $, put, toast, icon, avatar } from './core.js';

export function openPhotoPicker(me) {
  modal({ title: 'عکس پروفایل من', body: `<div class="photo-picker"><div class="photo-preview" id="photoPreview">${avatar(me.student?.avatar, 'lg')}</div><label class="btn soft" for="profilePhotoFile">${icon('camera')} انتخاب عکس</label><input class="sr-only" id="profilePhotoFile" type="file" accept="image/jpeg,image/png,image/webp"><p class="small muted">عکس JPG، PNG یا WebP، حداکثر ۶ مگابایت. کادر مرکزی عکس نمایش داده می‌شود.</p><p id="photoError" class="small neg" role="alert"></p><button class="btn block" id="saveProfilePhoto" disabled>ذخیره عکس</button></div>`, onOpen(m, close) {
    let payload = null; let version = 0; const save = $('#saveProfilePhoto', m); const err = $('#photoError',m);
    $('#profilePhotoFile',m).onchange = async e => {
      const current = ++version; payload = null; save.disabled = true; err.textContent = '';
      const file = e.target.files[0]; if (!file) return;
      try {
        if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw Error('فرمت عکس باید JPG، PNG یا WebP باشد.');
        if (file.size > 6*1024*1024) throw Error('حجم عکس باید کمتر از ۶ مگابایت باشد.');
        const url = URL.createObjectURL(file); const img = new Image();
        try {
          img.src=url; await img.decode();
          const size=Math.min(img.naturalWidth,img.naturalHeight); if (!size) throw Error('عکس قابل خواندن نیست.');
          const canvas=document.createElement('canvas'); canvas.width=canvas.height=512;
          const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,512,512);
          ctx.drawImage(img,(img.naturalWidth-size)/2,(img.naturalHeight-size)/2,size,size,0,0,512,512);
          if (current !== version) return;
          payload={name:'profile.jpg',data:canvas.toDataURL('image/jpeg',.9)};
          const preview=new Image();preview.src=payload.data;preview.alt='پیش‌نمایش عکس انتخاب‌شده';$('#photoPreview',m).replaceChildren(preview);save.disabled=false;
        } finally { URL.revokeObjectURL(url); }
      } catch(error) { if(current===version) err.textContent=error.message || 'خواندن عکس ممکن نشد.'; }
    };
    save.onclick=async()=>{if(!payload)return;save.disabled=true;err.textContent='';try{await put('/api/me/avatar',{file:payload});close();toast('عکس پروفایل ذخیره شد','ok');await window.roshdRefresh();}catch(error){err.textContent=error.message;save.disabled=false;}};
  }});
}
