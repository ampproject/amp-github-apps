function replyHiOrBye(greeting: string) {
  if (greeting == 'hello') {
    return 'hi';
  }

  if (greeting == 'goodbye') {
    return 'bye';
  }
}

test('replies to hello', () => {
  expect(replyHiOrBye('hello')).toBe('hi');  
});

test('replies to hello', () => {  
  expect(replyHiOrBye('goodbye')).toBe('bye');
});