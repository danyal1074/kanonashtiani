export const isElementary = me => me?.user?.role === 'student' && Number(me.student?.grade) >= 1 && Number(me.student?.grade) <= 6;
