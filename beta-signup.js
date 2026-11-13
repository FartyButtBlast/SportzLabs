(() => {
 const form=document.getElementById('beta-signup-form');
 if(!form)return;
 const button=form.querySelector('button[type="submit"]');
 const message=document.getElementById('beta-signup-message');
 let busy=false;
 form.addEventListener('submit',async(event)=>{
  event.preventDefault();
  if(busy||!form.reportValidity())return;
  busy=true;button.disabled=true;button.textContent='Submitting…';message.textContent='';
  const fields=new FormData(form);
  try{
   const response=await fetch('https://npllwuavofpfudchotma.supabase.co/functions/v1/platform-admin',{
    method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),
    body:JSON.stringify({action:'betaSignup',name:fields.get('name'),email:fields.get('email'),platform:fields.get('platform'),consent:fields.get('consent')==='on',website:fields.get('website')})
   });
   const result=await response.json();
   if(!response.ok||result.ok!==true)throw new Error(result.error||'Your request could not be submitted. Please try again.');
   message.className='beta-message success';message.textContent='Thanks! Your beta request has been received. We’ll contact you at your email address when a place is available.';
   form.reset();
  }catch(error){
   message.className='beta-message error';message.textContent=error.name==='TimeoutError'?'The request timed out. Please try again; repeated requests won’t create duplicates.':error instanceof TypeError?'Could not connect. Check your internet connection and try again.':error.message;
  }finally{busy=false;button.disabled=false;button.textContent='Request beta access';}
 });
})();
