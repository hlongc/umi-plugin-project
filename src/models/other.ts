import { useState } from 'react';

export default function () {
  const [hobby, setHobby] = useState<string>('coding');
  return {
    hobby,
    setHobby,
  };
}
