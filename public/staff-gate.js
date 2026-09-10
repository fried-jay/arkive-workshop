'use strict';
// 진행자(스태프) 페이지 접근 게이트 — 참가자의 우발적 접근 차단용(가벼운 차단).
(function () {
  var PW = '8210';
  var KEY = 'staff-auth';
  try { if (localStorage.getItem(KEY) === '1') return; } catch (e) {}
  var v = window.prompt('🔒 진행자 암호를 입력하세요');
  if (v === PW) {
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
    return;
  }
  window.alert('암호가 올바르지 않습니다. 참가자 화면으로 이동합니다.');
  window.location.replace('/');
})();
