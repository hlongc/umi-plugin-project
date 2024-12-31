import { useState } from 'react';

export default function () {
  const [age, setAge] = useState(18);
  return {
    age,
    setAge,
  };
}
