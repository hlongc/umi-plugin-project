import { useModel } from '@umijs/max';
import { useState } from 'react';

export default function () {
  const { hobby } = useModel('other');
  console.log('user hobby', hobby);
  const [age, setAge] = useState(18);
  return {
    age,
    setAge,
  };
}
